# 테이블 정의

import enum
from datetime import datetime

from sqlalchemy import Enum as SAEnum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Space(enum.StrEnum):
    DONGBANG = "동방"
    CONF_ROOM_1 = "대회의실1"
    CONF_ROOM_2 = "대회의실2"
    OUTSIDE_MIRROR = "바깥거울"

class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))
    song_title: Mapped[str] = mapped_column(String(100))
    start_at: Mapped[datetime]
    end_at: Mapped[datetime]
