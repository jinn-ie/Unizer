from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member, Note, RegularPractice, Reservation, Song, SongMember  # 테이블

from app.schemas import (  # 스키마
    ImportSong, MemberRead, NoteIn, NoteRead, PreviewSong, RegularPracticeIn, RegularPracticeRead,
    ReservationIn, ReservationRead, SongImportText, SongMemberRead, SongRead,
)
from app.song_import import build_preview


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

@app.post("/api/songs/import/preview", response_model=list[PreviewSong])
def preview_song_import(data: SongImportText, db: Annotated[Session, Depends(get_db)]):
    """붙여넣은 글자를 파싱해서 확인용으로 돌려줌 (DB 에 저장 안 함)"""
    return build_preview(db, data.text)


@app.post("/api/songs/import", response_model=list[SongRead], status_code=201)
def import_songs(songs: list[ImportSong], db: Annotated[Session, Depends(get_db)]):
    """확인이 끝난 곡들을 한꺼번에 저장. 하나라도 문제가 있으면 전부 저장 안 함"""
    created = []
    for s in songs:
        ids = [m.member_id for m in s.members]
        if len(set(ids)) != len(ids):
            raise HTTPException(400, f"'{s.title}'에 같은 부원이 두 번 들어 있어요.")
        for m in s.members:
            if db.get(Member, m.member_id) is None:
                raise HTTPException(404, f"'{s.title}'에 없는 부원 번호({m.member_id})가 있어요.")

        song = Song(title=s.title)
        db.add(song)
        db.add_all(SongMember(song=song, member_id=m.member_id, leader=m.leader) for m in s.members)
        created.append(song)

    db.commit()                 # 여기까지 오면 전부 한 번에 저장
    for song in created:
        db.refresh(song)
    return created

@app.post("/api/regular-practices", response_model=list[RegularPracticeRead], status_code=201)
def create_regular_practices(
    items: list[RegularPracticeIn], db: Annotated[Session, Depends(get_db)]
):
    """요일별 정규연습 여러 개를 한꺼번에 저장. 하나라도 문제가 있으면 전부 저장 안 함"""
    if not items:
        raise HTTPException(400, "등록할 시간표가 없어요.")

    created = []
    for data in items:
        check_regular(db, data)
        practice = RegularPractice(**data.model_dump())
        db.add(practice)
        created.append(practice)

    db.commit()
    for practice in created:
        db.refresh(practice)
    return created


# ── 날짜별 메모 (수정 기능 없음: 지우고 다시 남기기) ──
@app.get("/api/notes", response_model=list[NoteRead])
def list_notes(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Note).order_by(Note.date_on, Note.created_at)
    return db.scalars(stmt).all()


@app.post("/api/notes", response_model=NoteRead, status_code=201)
def create_note(data: NoteIn, db: Annotated[Session, Depends(get_db)]):
    note = Note(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@app.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int, db: Annotated[Session, Depends(get_db)]):
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "해당하는 메모가 없어요.")
    db.delete(note)
    db.commit()
