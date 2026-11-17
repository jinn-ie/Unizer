# 테이블 정의

import enum
from datetime import date, datetime, time

from sqlalchemy import Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Space(enum.StrEnum):
    DONGBANG = "동방"
    CONF_ROOM_1 = "대회의실1"
    CONF_ROOM_2 = "대회의실2"
    OUTSIDE_MIRROR = "바깥거울"

# 매주 반복되는 정규연습 (곡 연습 + 기본기 같은 공통 일정)
class RegularPractice(Base):
    __tablename__ = "regular_practices"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))  # "Runaway" 또는 "기본기" (나중에 song_id / title 로 분리)
    weekday: Mapped[int]                             # 0=일, 1=월, ... 6=토
    start_time: Mapped[time]                         # 시각만 (예: 19:00)
    end_time: Mapped[time]
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))
    starts_on: Mapped[date]                          # 이 날부터 (포함)
    ends_on: Mapped[date]                            # 이 날까지 (포함)

class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))
    song_title: Mapped[str] = mapped_column(String(100))
    start_at: Mapped[datetime]
    end_at: Mapped[datetime]
