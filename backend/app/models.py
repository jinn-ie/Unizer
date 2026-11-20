# 테이블 정의

import enum
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import CheckConstraint, Enum as SAEnum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

KST = timezone(timedelta(hours=9))

def now_kst() -> datetime:
    """지금 한국 시각 (다른 시간들처럼 타임존 정보 없이 저장)"""
    return datetime.now(KST).replace(tzinfo=None)

class Space(enum.StrEnum):
    DONGBANG = "동방"
    CONF_ROOM_1 = "대회의실1"
    CONF_ROOM_2 = "대회의실2"
    OUTSIDE_MIRROR = "바깥거울"

class Member(Base):
    __tablename__ = "members"
    __table_args__ = (UniqueConstraint("gen", "name", name="uq_member_gen_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    gen: Mapped[int]
    name: Mapped[str] = mapped_column(String(30))

class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))

class SongMember(Base):
    __tablename__ = "song_members"

    # 두 칸 모두 primary_key → 같은 곡에 같은 부원이 두 번 들어갈 수 없음
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"), primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), primary_key=True)
    leader: Mapped[bool] = mapped_column(default=False)

    song: Mapped["Song"] = relationship()
    member: Mapped["Member"] = relationship()

# 매주 반복되는 정규연습 (곡 연습 + 기본기 같은 공통 일정)
class RegularPractice(Base):
    __tablename__ = "regular_practices"
    __table_args__ = (
        CheckConstraint("starts_on <= ends_on", name="ck_rp_period"),
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_rp_weekday"),
        CheckConstraint("(song_id IS NULL) <> (title IS NULL)", name="ck_rp_song_or_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id"))
    title: Mapped[str | None] = mapped_column(String(100))  # "기본기"
    weekday: Mapped[int]                             # 0=일, 1=월, ... 6=토
    start_time: Mapped[time]                         # 시각만 (예: 19:00)
    end_time: Mapped[time]
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))
    starts_on: Mapped[date]                          # 이 날부터 (포함)
    ends_on: Mapped[date]                            # 이 날까지 (포함)

    song: Mapped["Song | None"] = relationship(lazy="joined")

    @property
    def song_title(self) -> str | None:
        return self.song.title if self.song else None

# 보충
class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (
        CheckConstraint("start_at < end_at", name="ck_res_time"),
        CheckConstraint("(song_id IS NULL) <> (title IS NULL)", name="ck_res_song_or_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id"))
    title: Mapped[str | None] = mapped_column(String(100))
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))
    start_at: Mapped[datetime]
    end_at: Mapped[datetime]
    created_at: Mapped[datetime | None] = mapped_column(default=now_kst)
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=now_kst)  # 마지막 수정 시각 (수정 전엔 None)

    song: Mapped["Song | None"] = relationship(lazy="joined")

    @property
    def song_title(self) -> str | None:
        return self.song.title if self.song else None


# 날짜별 메모 (예약으로 담기 어려운 내용을 줄글로)
class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    date_on: Mapped[date]                                            # 메모가 붙은 날짜
    text: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=now_kst)    # 남긴 시각

class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=now_kst)
