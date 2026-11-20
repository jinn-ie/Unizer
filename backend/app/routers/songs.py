from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member, Song, SongMember
from app.schemas import ImportSong, PreviewSong, SongImportText, SongMemberRead, SongRead
from app.song_import import build_preview

# 곡 + 곡에 참여하는 부원
# /api/songs 와 /api/song-members 두 갈래라서 prefix 는 공통 부분인 /api 까지만
router = APIRouter(prefix="/api", tags=["곡"])


@router.get("/songs", response_model=list[SongRead])                     # → GET /api/songs
def list_songs(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Song).order_by(Song.id)
    return db.scalars(stmt).all()


@router.get("/song-members", response_model=list[SongMemberRead])        # → GET /api/song-members
def list_song_members(db: Annotated[Session, Depends(get_db)]):
    return db.scalars(select(SongMember)).all()


@router.post("/songs/import/preview", response_model=list[PreviewSong])  # → POST /api/songs/import/preview
def preview_song_import(data: SongImportText, db: Annotated[Session, Depends(get_db)]):
    """붙여넣은 글자를 파싱해서 확인용으로 돌려줌 (DB 에 저장 안 함)"""
    return build_preview(db, data.text)


@router.post("/songs/import", response_model=list[SongRead], status_code=201)   # → POST /api/songs/import
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
