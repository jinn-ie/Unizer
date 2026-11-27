from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Show, ShowSong, Song
from app.routers.auth import SessionCookie, optional_member
from app.schemas import ShowIn, ShowRead
from app.services.activity import change_summary, log

# 공연 (곡 묶음). 공연을 지워도 곡은 그대로 남음
router = APIRouter(prefix="/api/shows", tags=["공연"])


def get_or_404(db: Session, show_id: int) -> Show:
    show = db.get(Show, show_id)
    if show is None:
        raise HTTPException(404, "해당하는 공연이 없어요.")
    return show


def check_show(db: Session, data: ShowIn, show_id: int | None = None) -> list[int]:
    """이름이 겹치지 않는지, 있는 곡들인지 확인하고, 중복을 뺀 곡 번호 목록을 돌려줌"""
    # 1. 같은 이름의 공연이 있으면 거절 (수정할 때는 자기 자신은 빼고 비교)
    stmt = select(Show.id).where(Show.name == data.name)
    if show_id is not None:
        stmt = stmt.where(Show.id != show_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(400, "같은 이름의 공연이 이미 있어요.")

    # 2. 같은 곡이 두 번 오면 하나만 남김
    song_ids = []
    for song_id in data.song_ids:
        if song_id not in song_ids:
            song_ids.append(song_id)

    # 3. 없는 곡 번호가 섞여 있으면 거절
    found = set(db.scalars(select(Song.id).where(Song.id.in_(song_ids))))
    if len(found) != len(song_ids):
        raise HTTPException(400, "없는 곡이 들어 있어요. 새로고침 후 다시 시도해 주세요.")
    return song_ids


@router.get("", response_model=list[ShowRead])                # → GET /api/shows
def list_shows(db: Annotated[Session, Depends(get_db)]):
    # 최근에 만든 공연이 위로
    return db.scalars(select(Show).order_by(Show.id.desc())).all()


@router.post("", response_model=ShowRead, status_code=201)    # → POST /api/shows
def create_show(data: ShowIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    song_ids = check_show(db, data)
    show = Show(name=data.name, links=[ShowSong(song_id=song_id) for song_id in song_ids])
    db.add(show)
    # 활동 기록: 로그인 안 하고 했으면 이름 없이 ("비로그인"으로 보여요)
    log(db, optional_member(db, token), "공연", "등록", f"'{data.name}' · {len(song_ids)}곡")
    db.commit()
    db.refresh(show)
    return show


@router.put("/{show_id}", response_model=ShowRead)            # → PUT /api/shows/{id}
def update_show(show_id: int, data: ShowIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    """이름 + 곡 목록을 통째로 바꾸기. 목록에서 빠진 곡은 공연에서 빠짐"""
    show = get_or_404(db, show_id)
    song_ids = check_show(db, data, show_id)
    before = f"'{show.name}' · {len(show.links)}곡"  # 기록용: 고치기 전 이름 · 곡 수
    show.name = data.name

    # 1. 계속 남는 곡의 연결만 남김 (빠진 곡의 연결은 delete-orphan 으로 지워짐)
    show.links = [link for link in show.links if link.song_id in song_ids]

    # 2. 새로 들어온 곡만 연결을 추가
    already = {link.song_id for link in show.links}
    for song_id in song_ids:
        if song_id not in already:
            show.links.append(ShowSong(song_id=song_id))

    log(db, optional_member(db, token), "공연", "수정", change_summary(before, f"'{data.name}' · {len(song_ids)}곡"))
    db.commit()
    db.refresh(show)
    return show


@router.delete("/{show_id}", status_code=204)                 # → DELETE /api/shows/{id}
def delete_show(show_id: int, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    show = get_or_404(db, show_id)
    log(db, optional_member(db, token), "공연", "삭제", f"'{show.name}' · {len(show.links)}곡")
    db.delete(show)            # 연결 줄은 cascade 로 같이 삭제, 곡은 그대로
    db.commit()
