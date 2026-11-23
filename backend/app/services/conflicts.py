"""연습을 저장하기 전에 하는 검사 (시간 순서, 곡/일정 이름, 겹침)"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Reservation, Song
from app.schemas import ReservationIn


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

    # 3. 같은 공간의 다른 연습과 겹치는지
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
