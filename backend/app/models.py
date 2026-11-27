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

# 순서 = 공간 우선순위
class Space(enum.StrEnum):
    DONGBANG = "동방"
    OUTSIDE_MIRROR = "바깥거울"
    CONF_ROOM_1 = "대회의실1"
    CONF_ROOM_2 = "대회의실2"
    ARA = "아라"

# 관리자 (기수, 이름). 남이 등록한 연습 · 메모, 시간표 수정 · 삭제를 할 수 있어요.
# 지금은 한 명이라 코드에 적어 둬요. (서버 DB 와 로컬 DB 의 id 가 달라서 id 대신 기수 + 이름으로)
# 관리자가 늘어나면 members 테이블에 칸을 만드는 게 좋아요.
ADMINS = {(42, "이서진")}

class Member(Base):
    __tablename__ = "members"
    __table_args__ = (UniqueConstraint("gen", "name", name="uq_member_gen_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    gen: Mapped[int]
    name: Mapped[str] = mapped_column(String(30))
    # 로그인 비밀번호 해시예요. None이면 비밀번호 없이 기수 + 이름으로 로그인해요.
    password_hash: Mapped[str | None] = mapped_column(String(96), default=None)

    @property
    def is_admin(self) -> bool:
        return (self.gen, self.name) in ADMINS

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

# 공연 (예: "2026 버스킹") = 곡 묶음. 한 곡이 여러 공연에 들어갈 수 있음
class Show(Base):
    __tablename__ = "shows"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    created_at: Mapped[datetime] = mapped_column(default=now_kst)

    # 공연을 지우면 연결 줄도 같이 지워짐 (곡 자체는 그대로)
    links: Mapped[list["ShowSong"]] = relationship(cascade="all, delete-orphan")

    @property
    def song_ids(self) -> list[int]:
        """화면에 보낼 곡 번호 목록"""
        return [link.song_id for link in self.links]
    
# 공연 ↔ 곡 연결 한 줄
class ShowSong(Base):
    __tablename__ = "show_songs"

    # 두 칸 모두 primary_key → 같은 공연에 같은 곡이 두 번 들어갈 수 없음
    show_id: Mapped[int] = mapped_column(ForeignKey("shows.id", ondelete="CASCADE"), primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"), primary_key=True)

# 시간표 (예: "2026 버스킹 2차곡" 11/02 ~ 11/29)
class Timetable(Base):
    __tablename__ = "timetables"
    __table_args__ = (CheckConstraint("starts_on <= ends_on", name="ck_tt_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    starts_on: Mapped[date]                          # 이 날부터 (포함)
    ends_on: Mapped[date]                            # 이 날까지 (포함)
    created_at: Mapped[datetime] = mapped_column(default=now_kst)
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=now_kst)

    # 시간표를 지우면 블록도 같이 지워짐
    slots: Mapped[list["TimetableSlot"]] = relationship(
        back_populates="timetable", cascade="all, delete-orphan", order_by="TimetableSlot.id"
    )

# 시간표 안의 블록 1개 (예: 화 13:00~15:00 BAD 동방) → 기간 안의 화요일마다 연습 1건씩
# 곡 연습이면 song_id, 곡이 아닌 일정(돌리기 · 기본기)이면 title
class TimetableSlot(Base):
    __tablename__ = "timetable_slots"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_ts_weekday"),
        CheckConstraint("start_time <> end_time", name="ck_ts_time"),
        CheckConstraint("(song_id IS NULL) <> (title IS NULL)", name="ck_ts_song_or_title"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    timetable_id: Mapped[int] = mapped_column(ForeignKey("timetables.id", ondelete="CASCADE"))
    song_id: Mapped[int | None] = mapped_column(ForeignKey("songs.id"))
    title: Mapped[str | None] = mapped_column(String(100))  # "기본기"
    weekday: Mapped[int]                             # 0=일, 1=월, ... 6=토
    start_time: Mapped[time]
    end_time: Mapped[time]                           # 시작보다 이르면 다음 날 (00:00 = 자정)
    space: Mapped[Space] = mapped_column(SAEnum(Space, native_enum=False, length=30))

    timetable: Mapped["Timetable"] = relationship(back_populates="slots")
    song: Mapped["Song | None"] = relationship(lazy="joined")

    @property
    def name(self) -> str:
        """화면 · 오류 문구에 쓰는 이름: 곡명 또는 일정 이름"""
        return self.song.title if self.song else (self.title or "")

# 연습
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
    # 시간표 블록으로 만든 연습이면 그 블록 번호, 직접 잡은 연습이면 None
    # (블록을 지울 땐 BE 에서 연습을 먼저 지움. SET NULL 은 혹시 남은 연습이 고아가 되지 않게 하는 안전장치)
    slot_id: Mapped[int | None] = mapped_column(ForeignKey("timetable_slots.id", ondelete="SET NULL"))
    personal: Mapped[bool] = mapped_column(default=False)      # 개인 보충이면 True (단체 연습은 False)
    # 등록한 부원. 이 사람(과 관리자)만 수정 · 삭제할 수 있어요.
    # 이 칸이 생기기 전의 연습 · 시간표로 만든 연습은 None → 관리자만 고칠 수 있어요.
    created_by: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    song: Mapped["Song | None"] = relationship(lazy="joined")
    creator: Mapped["Member | None"] = relationship(lazy="joined")  # 등록자 (이름을 화면에 보내려고)

    # 개인 보충에 함께하는 부원 (리더 포함). 연습을 지우면 같이 지워짐
    # lazy="selectin": 연습 목록을 불러올 때 연결 줄을 한 번에 모아서 가져옴 (연습마다 따로 묻지 않게)
    member_links: Mapped[list["ReservationMember"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def song_title(self) -> str | None:
        return self.song.title if self.song else None

    @property
    def created_by_name(self) -> str | None:
        """화면에 보낼 등록자 이름 (등록자를 모르면 None)"""
        return self.creator.name if self.creator else None

    @property
    def member_ids(self) -> list[int]:
        """화면에 보낼 함께하는 부원 번호 목록 (단체 연습이면 빈 목록)"""
        return [link.member_id for link in self.member_links]

# 개인 보충 ↔ 부원 연결 한 줄 (SongMember, ShowSong 과 같은 방식)
class ReservationMember(Base):
    __tablename__ = "reservation_members"

    # 두 칸 모두 primary_key → 같은 연습에 같은 부원이 두 번 들어갈 수 없음
    reservation_id: Mapped[int] = mapped_column(
        ForeignKey("reservations.id", ondelete="CASCADE"), primary_key=True
    )
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), primary_key=True)  

# 날짜별 메모 (예약으로 담기 어려운 내용을 줄글로)
class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    date_on: Mapped[date]                                            # 메모가 붙은 날짜
    text: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=now_kst)    # 남긴 시각
    # 남긴 부원. 이 사람(과 관리자)만 지울 수 있어요. 이 칸이 생기기 전의 메모는 None → 관리자만
    created_by: Mapped[int | None] = mapped_column(ForeignKey("members.id"))
    creator: Mapped["Member | None"] = relationship(lazy="joined")

    @property
    def created_by_name(self) -> str | None:
        """화면에 보낼 작성자 이름 (작성자를 모르면 None)"""
        return self.creator.name if self.creator else None

class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(default=now_kst)


# ── 로그인 ──
class LoginSession(Base):
    __tablename__ = "login_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(index=True)

# 타임픽: 매주 반복되는 안 되는 칸 (수업, 알바 등)
# 행이 있으면 = 그 요일 그 30분 칸은 매주 안 됨
class TimepickWeekly(Base):
    __tablename__ = "timepick_weekly"
    __table_args__ = (CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_tpw_weekday"),)

    # 세 칸 모두 primary_key → 같은 칸이 두 번 저장될 수 없음
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), primary_key=True)
    weekday: Mapped[int] = mapped_column(primary_key=True)      # 0=일, 1=월, ... 6=토 (시간표 블록과 같음)
    start_time: Mapped[time] = mapped_column(primary_key=True)  # 칸 시작 시각 (30분 칸: 16:00, 16:30 …)

# 타임픽: 이 날만 바꾼 칸
#   busy=True  → 이 날만 안 됨
#   busy=False → 매주 안 되는 칸인데 이 날만 됨 (휴강 등)
class TimepickDay(Base):
    __tablename__ = "timepick_days"

    member_id: Mapped[int] = mapped_column(ForeignKey("members.id", ondelete="CASCADE"), primary_key=True)
    date_on: Mapped[date] = mapped_column(primary_key=True)     # 그 날짜
    start_time: Mapped[time] = mapped_column(primary_key=True)  # 칸 시작 시각
    busy: Mapped[bool]
