from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member, RegularPractice, Reservation, Song, SongMember  # 테이블
from app.schemas import (  # 스키마
    MemberRead, RegularPracticeRead, ReservationIn, ReservationRead, SongMemberRead, SongRead,
)

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
  
# FastAPI 앱 객체. uvicorn 이 이 객체를 찾아서 실행한다. (app.main:app)
app = FastAPI(title="dance-ud API")

# GET / 요청이 오면 이 함수가 실행되고, 반환한 dict 가 JSON 으로 응답된다.
@app.get("/")
def hello():
    return {"message": "춤춰라 유디!"}

@app.get("/api/regular-practices", response_model=list[RegularPracticeRead])
def list_regular_practices(db: Annotated[Session, Depends(get_db)]):
    stmt = select(RegularPractice).order_by(
        RegularPractice.starts_on, RegularPractice.weekday, RegularPractice.start_time
    )
    return db.scalars(stmt).all()

@app.get("/api/reservations", response_model=list[ReservationRead])
def list_reservations(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Reservation).order_by(Reservation.start_at)
    return db.scalars(stmt).all()

@app.get("/api/members", response_model=list[MemberRead])
def list_members(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Member).order_by(Member.gen, Member.id)
    return db.scalars(stmt).all()

@app.get("/api/songs", response_model=list[SongRead])
def list_songs(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Song).order_by(Song.id)
    return db.scalars(stmt).all()

@app.get("/api/song-members", response_model=list[SongMemberRead])
def list_song_members(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(select(SongMember)).all()

@app.post("/api/reservations", response_model=ReservationRead, status_code=201)
def create_reservation(data: ReservationIn, db: Annotated[Session, Depends(get_db)]):
    check_reservation(db, data)
    reservation = Reservation(**data.model_dump())
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation

@app.put("/api/reservations/{reservation_id}", response_model=ReservationRead)
def update_reservation(reservation_id: int, data: ReservationIn, db: Annotated[Session, Depends(get_db)]):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(404, "해당하는 보충이 없어요.")
    check_reservation(db, data, exclude_id=reservation_id)
    for key, value in data.model_dump().items():
        setattr(reservation, key, value)
    db.commit()
    db.refresh(reservation)
    return reservation

@app.delete("/api/reservations/{reservation_id}", status_code=204)
def delete_reservation(reservation_id: int, db: Annotated[Session, Depends(get_db)]):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(404, "해당하는 보충이 없어요.")
    db.delete(reservation)
    db.commit()
