from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Note
from app.schemas import NoteIn, NoteRead

# prefix: 이 파일의 모든 경로 앞에 자동으로 붙음
# tags:   /docs 화면에서 API를 묶어 보여줄 이름
router = APIRouter(prefix="/api/notes", tags=["메모"])


@router.get("", response_model=list[NoteRead])          # → GET /api/notes
def list_notes(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Note).order_by(Note.date_on, Note.created_at)
    return db.scalars(stmt).all()


@router.post("", response_model=NoteRead, status_code=201)   # → POST /api/notes
def create_note(data: NoteIn, db: Annotated[Session, Depends(get_db)]):
    note = Note(**data.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)            # → DELETE /api/notes/{note_id}
def delete_note(note_id: int, db: Annotated[Session, Depends(get_db)]):
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "해당하는 메모가 없어요.")
    db.delete(note)
    db.commit()
