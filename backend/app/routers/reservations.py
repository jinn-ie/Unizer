from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reservation, ReservationMember
from app.routers.auth import SessionCookie, logged_in_member
from app.schemas import ReservationIn, ReservationRead
from app.services.conflicts import check_reservation, personal_member_ids

# 연습 (날짜 하나에 잡는 연습 1건. 시간표로 만든 연습도 여기서 하나씩 수정/삭제)
# 보기는 누구나, 등록은 로그인한 사람, 수정 · 삭제는 등록한 본인과 관리자만
router = APIRouter(prefix="/api/reservations", tags=["연습"])


def get_changeable(db: Session, token: str | None, reservation_id: int) -> Reservation:
    """수정 · 삭제할 연습을 찾고, 고칠 권한이 있는지 확인
    로그인 안 했으면 401, 없는 연습이면 404, 남이 등록한 연습이면 403"""
    member = logged_in_member(db, token)
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(404, "해당하는 연습이 없어요.")
    # 등록자가 없는 연습(예전 연습 · 시간표로 만든 연습)은 created_by 가 None 이라 관리자만 통과
    if not member.is_admin and reservation.created_by != member.id:
        raise HTTPException(403, "등록한 사람만 수정 · 삭제할 수 있어요.")
    return reservation


@router.get("", response_model=list[ReservationRead])                    # → GET /api/reservations
def list_reservations(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Reservation).order_by(Reservation.start_at)
    return db.scalars(stmt).all()


@router.post("", response_model=ReservationRead, status_code=201)        # → POST /api/reservations
def create_reservation(data: ReservationIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    member = logged_in_member(db, token)  # 누가 등록했는지 남겨야 해서 로그인 필요
    check_reservation(db, data)
    member_ids = personal_member_ids(db, data)
    # member_ids 는 테이블 컬럼이 아니라서 빼고 만들고, 연결 줄로 따로 넣음
    reservation = Reservation(**data.model_dump(exclude={"member_ids"}), created_by=member.id)
    reservation.member_links = [ReservationMember(member_id=m) for m in member_ids]
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation


@router.put("/{reservation_id}", response_model=ReservationRead)         # → PUT /api/reservations/{id}
def update_reservation(
    reservation_id: int, data: ReservationIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None
):
    reservation = get_changeable(db, token, reservation_id)
    check_reservation(db, data, exclude_id=reservation_id)
    member_ids = personal_member_ids(db, data)
    # ReservationIn 에는 created_by 가 없어서, 관리자가 고쳐도 등록자는 그대로 남음
    for key, value in data.model_dump(exclude={"member_ids"}).items():
        setattr(reservation, key, value)

    # 함께하는 부원을 통째로 바꾸기 (공연의 곡 목록 바꾸기와 같은 방법)
    # 1. 계속 남는 사람의 연결만 남김 (빠진 사람의 연결은 delete-orphan 으로 지워짐)
    reservation.member_links = [link for link in reservation.member_links if link.member_id in member_ids]
    # 2. 새로 들어온 사람만 연결을 추가
    already = {link.member_id for link in reservation.member_links}
    for member_id in member_ids:
        if member_id not in already:
            reservation.member_links.append(ReservationMember(member_id=member_id))

    db.commit()
    db.refresh(reservation)
    return reservation


@router.delete("/{reservation_id}", status_code=204)                     # → DELETE /api/reservations/{id}
def delete_reservation(reservation_id: int, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    reservation = get_changeable(db, token, reservation_id)
    db.delete(reservation)
    db.commit()
