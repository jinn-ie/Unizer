from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ActivityLog
from app.routers.auth import SessionCookie, require_admin
from app.schemas import ActivityRead

# 관리자 페이지: 모든 활동 기록 보기 (관리자만. 아니면 403, 로그인 안 했으면 401)
router = APIRouter(prefix="/api/admin", tags=["관리자"])


@router.get("/activity", response_model=list[ActivityRead])             # → GET /api/admin/activity
def list_activity(
    db: Annotated[Session, Depends(get_db)],
    token: SessionCookie = None,
    kind: str | None = None,              # 분류로 거르기 (예: "연습"). 없으면 전체
    member_id: int | None = None,         # 한 사람만 보기. 없으면 전체
    before_id: int | None = None,         # '더 보기': 이 번호보다 오래된 것만 (처음엔 비워 둬요)
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
):
    """최근 것부터 limit 개. 다음 쪽은 받은 것 중 마지막 id 를 before_id 로 보내면 돼요."""
    require_admin(db, token)
    stmt = select(ActivityLog).order_by(ActivityLog.id.desc()).limit(limit)
    if kind:
        stmt = stmt.where(ActivityLog.kind == kind)
    if member_id is not None:
        stmt = stmt.where(ActivityLog.member_id == member_id)
    if before_id is not None:
        stmt = stmt.where(ActivityLog.id < before_id)
    return db.scalars(stmt).all()
