from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict
from app.models import Space

class RegularPracticeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    weekday: int
    start_time: time
    end_time: time
    space: Space
    starts_on: date
    ends_on: date

class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # SQLAlchemy 객체에서 값을 읽어올 수 있게

    id: int
    space: Space
    song_title: str
    start_at: datetime
    end_at: datetime
