from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Feedback
from app.schemas import FeedbackIn, FeedbackRead

router = APIRouter(prefix="/api/feedback", tags=["의견 보내기"])


@router.post("", response_model=FeedbackRead, status_code=201)           # → POST /api/feedback
def send_feedback(data: FeedbackIn, db: Annotated[Session, Depends(get_db)]):
    feedback = Feedback(**data.model_dump())
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback
