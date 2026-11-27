from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member, SongMember, TimepickDay, TimepickWeekly
from app.routers.auth import SessionCookie, logged_in_session
from app.schemas import TeamTimepickRead, TimepickDayCell, TimepickRead, TimepickWeeklyCell
from app.services.activity import log

router = APIRouter(prefix="/api/timepicks", tags=["타임픽"])
Db = Annotated[Session, Depends(get_db)]


def read_timepick(db: Session, member_id: int) -> dict:
    """한 사람이 칠한 칸 전부 (매주 칸 + 이 날만 칸)"""
    weekly = db.scalars(select(TimepickWeekly).where(TimepickWeekly.member_id == member_id)).all()
    days = db.scalars(select(TimepickDay).where(TimepickDay.member_id == member_id)).all()
    return {"weekly": weekly, "days": days}


@router.get("/me", response_model=TimepickRead)                   # → GET /api/timepicks/me
def my_timepick(db: Db, token: SessionCookie = None):
    member_id = logged_in_session(db, token).member_id
    return read_timepick(db, member_id)


# 매주 칸을 통째로 바꿔요: 지우고 → 받은 칸으로 다시 채우기
@router.put("/me/weekly", status_code=204)                         # → PUT /api/timepicks/me/weekly
def save_weekly(cells: list[TimepickWeeklyCell], db: Db, token: SessionCookie = None):
    member_id = logged_in_session(db, token).member_id
    db.execute(delete(TimepickWeekly).where(TimepickWeekly.member_id == member_id))
    # 같은 칸이 두 번 와도 한 번만 저장 (set 이 중복을 없애 줘요)
    for weekday, start_time in {(c.weekday, c.start_time) for c in cells}:
        db.add(TimepickWeekly(member_id=member_id, weekday=weekday, start_time=start_time))
    # 활동 기록: 누가 언제만 (칸 내용은 안 남겨요). 자동 저장이 자주 와서 10분 안이면 한 줄로 합쳐요
    log(db, db.get(Member, member_id), "타임픽", "저장", "매주 칸", merge=True)
    db.commit()


# 그 주(일요일 ~ 토요일)의 '이 날만' 칸을 통째로 바꿔요
@router.put("/me/days/{week_start}", status_code=204)              # → PUT /api/timepicks/me/days/2026-11-29
def save_week_days(week_start: date, cells: list[TimepickDayCell], db: Db, token: SessionCookie = None):
    member_id = logged_in_session(db, token).member_id
    # 파이썬 weekday(): 월=0 … 일=6
    if week_start.weekday() != 6:
        raise HTTPException(422, "주의 시작은 일요일이어야 해요.")
    week_end = week_start + timedelta(days=6)
    if any(not (week_start <= c.date_on <= week_end) for c in cells):
        raise HTTPException(422, "그 주 밖의 날짜가 들어 있어요.")

    db.execute(delete(TimepickDay).where(
        TimepickDay.member_id == member_id,
        TimepickDay.date_on.between(week_start, week_end),
    ))
    # 같은 칸이 두 번 오면 마지막 값으로
    busy_by_cell = {(c.date_on, c.start_time): c.busy for c in cells}
    for (date_on, start_time), busy in busy_by_cell.items():
        db.add(TimepickDay(member_id=member_id, date_on=date_on, start_time=start_time, busy=busy))
    log(db, db.get(Member, member_id), "타임픽", "저장", f"{week_start:%m/%d} 주의 이 날만 칸", merge=True)
    db.commit()


# 팀 화면: 그 곡의 리더만, 팀원 전원의 칠한 칸을 볼 수 있어요
@router.get("/songs/{song_id}", response_model=list[TeamTimepickRead])  # → GET /api/timepicks/songs/3
def team_timepick(song_id: int, db: Db, token: SessionCookie = None):
    member_id = logged_in_session(db, token).member_id
    links = db.scalars(select(SongMember).where(SongMember.song_id == song_id)).all()
    if not any(link.member_id == member_id and link.leader for link in links):
        raise HTTPException(403, "이 곡의 리더만 볼 수 있어요.")
    return [{"member_id": link.member_id, **read_timepick(db, link.member_id)} for link in links]
