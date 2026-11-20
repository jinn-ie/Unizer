from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import RegularPractice
from app.schemas import RegularPracticeIn, RegularPracticeRead
from app.services.conflicts import check_regular

# 정규연습 (기간 동안 매주 같은 요일 · 같은 시간에 반복)
router = APIRouter(prefix="/api/regular-practices", tags=["정규연습"])


@router.get("", response_model=list[RegularPracticeRead])                # → GET /api/regular-practices
def list_regular_practices(db: Annotated[Session, Depends(get_db)]):
    stmt = select(RegularPractice).order_by(
        RegularPractice.starts_on, RegularPractice.weekday, RegularPractice.start_time
    )
    return db.scalars(stmt).all()


@router.post("", response_model=list[RegularPracticeRead], status_code=201)   # → POST /api/regular-practices
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
