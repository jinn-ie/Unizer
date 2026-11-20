"""보충 · 정규연습을 저장하기 전에 하는 검사 (시간 순서, 곡/일정 이름, 겹침)"""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RegularPractice, Reservation, Song
from app.schemas import RegularPracticeIn, ReservationIn


def find_regular_clash(db: Session, data: ReservationIn):
    """같은 공간의 정규연습 중 시간이 겹치는 게 있으면 (정규연습, 시작, 끝)을 돌려줌"""
    first_day = data.start_at.date() - timedelta(days=1)    # 전날 밤에 시작해 자정을 넘긴 정규연습도 확인
    last_day = data.end_at.date()

    stmt = select(RegularPractice).where(
        RegularPractice.space == data.space,
        RegularPractice.starts_on <= last_day,
        RegularPractice.ends_on >= first_day,
    )
    for rp in db.scalars(stmt):
        day = first_day
        while day <= last_day:
            # isoweekday(): 월=1 … 일=7  →  % 7 하면 일=0, 월=1 … 토=6 (우리 weekday 규칙)
            if rp.starts_on <= day <= rp.ends_on and day.isoweekday() % 7 == rp.weekday:
                rp_start = datetime.combine(day, rp.start_time)
                rp_end = datetime.combine(day, rp.end_time)
                if rp_end <= rp_start:
                    rp_end += timedelta(days=1)
                if rp_start < data.end_at and rp_end > data.start_at:
                    return rp, rp_start, rp_end
            day += timedelta(days=1)
    return None

def check_reservation(db: Session, data: ReservationIn, exclude_id: int | None = None):
    """등록/수정 전에 검사. 문제가 있으면 HTTPException 으로 멈춤"""
    # 1. 시작 < 종료
    if data.start_at >= data.end_at:
        raise HTTPException(400, "끝나는 시간은 시작 시간보다 늦어야 해요.")

    # 2. 곡 / 공통 일정 중 딱 하나만
    if (data.song_id is None) == (data.title is None):
        raise HTTPException(400, "곡과 일정 이름 중 하나만 입력해 주세요.")
    if data.song_id is not None and db.get(Song, data.song_id) is None:
        raise HTTPException(404, "그런 곡이 없어요.")

    # 3. 같은 공간의 정규연습과 겹치는지
    found = find_regular_clash(db, data)
    if found:
        rp, rp_start, rp_end = found
        name = rp.song_title or rp.title
        raise HTTPException(
            409, f"{data.space}에 '{name}' 정규연습이 있어요. ({rp_start:%H:%M}~{rp_end:%H:%M})"
        )

    # 4. 같은 공간의 다른 보충과 겹치는지
    stmt = select(Reservation).where(
        Reservation.space == data.space,
        Reservation.start_at < data.end_at,
        Reservation.end_at > data.start_at,
    )
    if exclude_id is not None:                     # 수정할 땐 자기 자신은 빼고 비교
        stmt = stmt.where(Reservation.id != exclude_id)
    clash = db.scalars(stmt).first()
    if clash:
        name = clash.song_title or clash.title
        raise HTTPException(
            409, f"{data.space}에 이미 '{name}' 연습이 있어요. ({clash.start_at:%H:%M}~{clash.end_at:%H:%M})"
        )

WEEKDAY_NAMES = "일월화수목금토"   # WEEKDAY_NAMES[1] → "월"


def check_regular(db: Session, data: RegularPracticeIn):
    """정규연습 등록 전에 검사. 문제가 있으면 HTTPException 으로 멈춤"""
    # 1. 시간 / 기간 순서
    if data.start_time >= data.end_time:
        raise HTTPException(400, "끝나는 시간은 시작 시간보다 늦어야 해요.")
    if data.starts_on > data.ends_on:
        raise HTTPException(400, "적용 기간의 끝이 시작보다 빨라요.")

    # 2. 곡 / 공통 일정 중 딱 하나만
    if (data.song_id is None) == (data.title is None):
        raise HTTPException(400, "곡과 일정 이름 중 하나만 입력해 주세요.")
    if data.song_id is not None and db.get(Song, data.song_id) is None:
        raise HTTPException(404, "해당하는 곡이 없어요.")

    # 3. 같은 공간 · 같은 요일 · 기간이 겹치고 · 시간이 겹치는 정규연습이 있는지
    clash = db.scalars(
        select(RegularPractice).where(
            RegularPractice.space == data.space,
            RegularPractice.weekday == data.weekday,
            RegularPractice.starts_on <= data.ends_on,      # 기간 겹침
            RegularPractice.ends_on >= data.starts_on,
            RegularPractice.start_time < data.end_time,     # 시간 겹침
            RegularPractice.end_time > data.start_time,
        )
    ).first()
    if clash:
        name = clash.song_title or clash.title
        raise HTTPException(
            409,
            f"{WEEKDAY_NAMES[data.weekday]}요일 {data.space}에 이미 '{name}' 정규연습이 있어요. "
            f"({clash.start_time:%H:%M}~{clash.end_time:%H:%M})",
        )
