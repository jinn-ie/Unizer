from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models import Space

class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # SQLAlchemy 객체에서 값을 읽어올 수 있게

    id: int
    space: Space
    song_title: str
    start_at: datetime
    end_at: datetime
