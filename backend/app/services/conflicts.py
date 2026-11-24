"""연습을 저장하기 전에 하는 검사 (시간 순서, 곡/일정 이름, 겹침)"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Reservation, Song, SongMember
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

def personal_member_ids(db: Session, data: ReservationIn) -> list[int]:
    """개인 보충이면 함께하는 부원을 검사하고, 리더를 더한 최종 부원 번호 목록을 돌려줌
    단체 연습이면 빈 목록 (보낸 member_ids 는 무시)"""
    if not data.personal:
        return []

    # 1. 개인 보충은 곡 연습일 때만 (돌리기 같은 공통 일정은 멤버가 없음)
    if data.song_id is None:
        raise HTTPException(400, "개인 보충은 곡 연습일 때만 할 수 있어요.")

    # 2. 이 곡의 멤버 (부원 번호 → 리더인지)
    rows = db.scalars(select(SongMember).where(SongMember.song_id == data.song_id)).all()
    is_leader = {row.member_id: row.leader for row in rows}

    # 3. 보낸 사람이 전부 이 곡 멤버인지
    for member_id in data.member_ids:
        if member_id not in is_leader:
            raise HTTPException(400, "이 곡의 멤버가 아닌 사람이 있어요.")

    # 4. 리더 말고 한 명 이상은 골라야 함
    chosen = [m for m in data.member_ids if not is_leader[m]]
    if not chosen:
        raise HTTPException(400, "개인 보충은 함께하는 사람을 한 명 이상 골라 주세요.")

    # 5. 리더는 항상 포함 (화면에서 빠뜨려도 서버가 넣어 줌) + 같은 사람 두 번은 한 번만
    result = [m for m, leader in is_leader.items() if leader]
    for member_id in chosen:
        if member_id not in result:
            result.append(member_id)
    return result
