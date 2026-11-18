from typing import Annotated

from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member, RegularPractice, Reservation, Song, SongMember  # 테이블
from app.schemas import (  # 스키마
    MemberRead, RegularPracticeRead, ReservationRead, SongMemberRead, SongRead,
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
