from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Member
from app.schemas import MemberRead

router = APIRouter(prefix="/api/members", tags=["부원"])


@router.get("", response_model=list[MemberRead])                         # → GET /api/members
def list_members(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Member).order_by(Member.gen, Member.id)
    return db.scalars(stmt).all()
