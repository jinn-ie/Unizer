from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Timetable, TimetableSlot
from app.routers.auth import SessionCookie, logged_in_member
from app.schemas import TimetableIn, TimetableRead
from app.services.timetables import check_timetable, clear_slots, generate

# 시간표 (곡 블록을 기간 동안 요일마다 반복 → 연습으로 저장)
# 생성 · 수정 · 삭제 모두 기간 전체 기준 (지난 날짜의 연습도 같이 만들고 / 바꾸고 / 지움)
# 보기는 누구나, 생성은 로그인한 사람, 수정 · 삭제는 관리자만
# (수정 · 삭제하면 연습이 한꺼번에 바뀌어서, 남이 등록한 연습을 지우는 길이 되지 않게)
router = APIRouter(prefix="/api/timetables", tags=["시간표"])


def check_admin(db: Session, token: str | None) -> None:
    """관리자가 아니면 403 (로그인 안 했으면 401)"""
    if not logged_in_member(db, token).is_admin:
        raise HTTPException(403, "시간표 수정 · 삭제는 관리자만 할 수 있어요.")


def get_or_404(db: Session, tt_id: int) -> Timetable:
    tt = db.get(Timetable, tt_id)
    if tt is None:
        raise HTTPException(404, "해당하는 시간표가 없어요.")
    return tt


@router.get("", response_model=list[TimetableRead])                      # → GET /api/timetables
def list_timetables(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(select(Timetable).order_by(Timetable.starts_on.desc())).all()


@router.get("/{tt_id}", response_model=TimetableRead)                    # → GET /api/timetables/{id}
def get_timetable(tt_id: int, db: Annotated[Session, Depends(get_db)]):
    return get_or_404(db, tt_id)


@router.post("", response_model=TimetableRead, status_code=201)          # → POST /api/timetables
def create_timetable(data: TimetableIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    """시간표 + 블록 저장하고, 블록마다 연습 만들기. 하나라도 겹치면 전부 저장 안 함"""
    logged_in_member(db, token)                    # 로그인만 확인 (안 했으면 401)
    check_timetable(db, data)
    tt = Timetable(
        name=data.name, starts_on=data.starts_on, ends_on=data.ends_on,
        slots=[TimetableSlot(**s.model_dump(exclude={"id"})) for s in data.slots],
    )
    db.add(tt)
    db.flush()                                     # 블록 id 가 생겨야 연습에 slot_id 를 넣을 수 있음
    for slot in tt.slots:
        generate(db, tt, slot)
    db.commit()
    db.refresh(tt)
    return tt


@router.put("/{tt_id}", response_model=TimetableRead)                    # → PUT /api/timetables/{id}
def update_timetable(
    tt_id: int, data: TimetableIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None
):
    """바뀐 블록(또는 기간이 바뀌면 전부)의 연습을 지우고 다시 만들기. 안 바뀐 블록의 연습은 그대로"""
    check_admin(db, token)
    tt = get_or_404(db, tt_id)
    check_timetable(db, data)
    period_changed = (tt.starts_on, tt.ends_on) != (data.starts_on, data.ends_on)
    tt.name, tt.starts_on, tt.ends_on = data.name, data.starts_on, data.ends_on

    existing = {s.id: s for s in tt.slots}
    incoming_ids = {s.id for s in data.slots if s.id is not None}
    if not incoming_ids <= existing.keys():
        raise HTTPException(400, "이 시간표에 없는 블록이에요.")

    # 1. 빠진 블록: 그 블록의 연습 지우고 블록 삭제
    removed = [s for sid, s in existing.items() if sid not in incoming_ids]
    clear_slots(db, [s.id for s in removed])
    for s in removed:
        tt.slots.remove(s)                         # delete-orphan → 블록 삭제

    # 2. 새 블록 / 바뀐 블록
    to_generate = []
    for s_in in data.slots:
        fields = s_in.model_dump(exclude={"id"})
        if s_in.id is None:
            slot = TimetableSlot(**fields)
            tt.slots.append(slot)
            to_generate.append(slot)
            continue
        slot = existing[s_in.id]
        if period_changed or any(getattr(slot, k) != v for k, v in fields.items()):
            clear_slots(db, [slot.id])
            for k, v in fields.items():
                setattr(slot, k, v)
            to_generate.append(slot)

    db.flush()
    for slot in to_generate:                       # 지운 뒤에 만들어서, 자기 옛 연습과는 겹침으로 안 잡힘
        generate(db, tt, slot)
    db.commit()
    db.refresh(tt)
    return tt


@router.delete("/{tt_id}", status_code=204)                              # → DELETE /api/timetables/{id}
def delete_timetable(tt_id: int, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    """시간표 삭제: 그 시간표로 만든 연습도 전부 지움"""
    check_admin(db, token)
    tt = get_or_404(db, tt_id)
    clear_slots(db, [s.id for s in tt.slots])
    db.delete(tt)                                  # 블록은 cascade 로 같이 삭제
    db.commit()
