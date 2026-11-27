from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Note
from app.routers.auth import SessionCookie, logged_in_member
from app.schemas import NoteIn, NoteRead

# prefix: 이 파일의 모든 경로 앞에 자동으로 붙음
# tags:   /docs 화면에서 API를 묶어 보여줄 이름
# 보기는 누구나, 남기기는 로그인한 사람, 지우기는 남긴 본인과 관리자만 (연습과 같은 규칙)
router = APIRouter(prefix="/api/notes", tags=["메모"])


@router.get("", response_model=list[NoteRead])          # → GET /api/notes
def list_notes(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Note).order_by(Note.date_on, Note.created_at)
    return db.scalars(stmt).all()


@router.post("", response_model=NoteRead, status_code=201)   # → POST /api/notes
def create_note(data: NoteIn, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    member = logged_in_member(db, token)  # 누가 남겼는지 보여줘야 해서 로그인 필요
    note = Note(**data.model_dump(), created_by=member.id)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)            # → DELETE /api/notes/{note_id}
def delete_note(note_id: int, db: Annotated[Session, Depends(get_db)], token: SessionCookie = None):
    member = logged_in_member(db, token)
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "해당하는 메모가 없어요.")
    # 작성자가 없는 예전 메모는 created_by 가 None 이라 관리자만 통과
    if not member.is_admin and note.created_by != member.id:
        raise HTTPException(403, "남긴 사람만 지울 수 있어요.")
    db.delete(note)
    db.commit()
