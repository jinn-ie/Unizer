"""시간표 검사 + 블록을 실제 연습(reservations)으로 만들기 / 지우기"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Reservation, Song, SongMember, Timetable, TimetableSlot
from app.schemas import ReservationIn, TimetableIn
from app.services.conflicts import check_reservation

MAX_DAYS = 180                   # 기간 최대 길이 (연도 오타로 1년치가 들어가는 것 방지)
WEEKDAY_NAMES = "일월화수목금토"   # WEEKDAY_NAMES[2] → "화"


def check_timetable(db: Session, data: TimetableIn):
    """등록/수정 전에 검사. 문제가 있으면 HTTPException 으로 멈춤"""
    if data.starts_on > data.ends_on:
        raise HTTPException(400, "기간의 끝이 시작보다 빨라요.")
    if (data.ends_on - data.starts_on).days > MAX_DAYS:
        raise HTTPException(400, f"기간은 최대 {MAX_DAYS}일까지 등록할 수 있어요.")
    for s in data.slots:
        if s.start_time == s.end_time:
            raise HTTPException(400, "끝나는 시간은 시작 시간과 달라야 해요.")
        if (s.song_id is None) == (s.title is None):
            raise HTTPException(400, "블록마다 곡과 일정 이름 중 하나만 넣어 주세요.")
        if s.song_id is not None and db.get(Song, s.song_id) is None:
            raise HTTPException(404, "그런 곡이 없어요.")


def clear_slots(db: Session, slot_ids: list[int]):
    """그 블록들로 만든 연습 전부 지우기 (기간 전체, 지난 연습 포함)"""
    if slot_ids:
        db.execute(delete(Reservation).where(Reservation.slot_id.in_(slot_ids)))


def song_leader_id(db: Session, song_id: int | None) -> int | None:
    """곡의 리더 번호 (리더가 여러 명이면 번호가 가장 작은 사람). 곡이 아니거나 리더가 없으면 None"""
    if song_id is None:
        return None
    return db.scalar(
        select(func.min(SongMember.member_id)).where(SongMember.song_id == song_id, SongMember.leader)
    )


def generate(db: Session, tt: Timetable, slot: TimetableSlot) -> int:
    """블록 하나 → 기간 안의 그 요일마다 연습 1건 (기간 전체, 지난 날짜 포함). 만든 개수를 돌려줌"""
    # 시간표로 만든 곡 연습의 등록자 = 그 곡의 리더 (리더가 하루씩 옮기거나 지울 수 있게)
    # 곡이 아닌 일정(기본기 등)은 None → 관리자만 고칠 수 있어요.
    leader_id = song_leader_id(db, slot.song_id)
    count = 0
    day = tt.starts_on
    while day <= tt.ends_on:
        # isoweekday(): 월=1 … 일=7  →  % 7 하면 일=0, 월=1 … 토=6
        if day.isoweekday() % 7 == slot.weekday:
            start_at = datetime.combine(day, slot.start_time)
            end_at = datetime.combine(day, slot.end_time)
            if end_at < start_at:                   # 자정을 넘기면 다음 날
                end_at += timedelta(days=1)
            item = ReservationIn(
                song_id=slot.song_id, title=slot.title,   # 곡 연습 또는 일정 이름 (기본기 등)
                space=slot.space, start_at=start_at, end_at=end_at,
            )
            try:
                check_reservation(db, item)         # 앞에서 add 한 것도 autoflush 로 같이 검사됨
            except HTTPException as e:
                raise HTTPException(
                    e.status_code,
                    f"{slot.name} {day:%m/%d}({WEEKDAY_NAMES[slot.weekday]}) · {e.detail}",
                )
            # member_ids 는 테이블 컬럼이 아니라서 뺌 (시간표로 만든 연습은 항상 단체)
            db.add(Reservation(**item.model_dump(exclude={"member_ids"}), slot_id=slot.id, created_by=leader_id))
            count += 1
        day += timedelta(days=1)
    return count
