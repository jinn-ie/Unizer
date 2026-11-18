from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict
from app.models import Space

class RegularPracticeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    song_id: int | None     # 곡 연습이면 번호, 공통 일정이면 null
    song_title: str | None  # 곡 연습이면 곡명
    title: str | None       # 공통 일정이면 이름
    weekday: int
    start_time: time
    end_time: time
    space: Space
    starts_on: date
    ends_on: date

class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # SQLAlchemy 객체에서 값을 읽어올 수 있게

    id: int
    song_id: int | None
    song_title: str | None     # 모델의 @property에서 읽어옴
    title: str | None
    space: Space
    start_at: datetime
    end_at: datetime
