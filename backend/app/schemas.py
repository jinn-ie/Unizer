import re
from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from app.models import Space

class ReservationIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    song_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=100)
    space: Space
    start_at: datetime
    end_at: datetime
    personal: bool = False          # 개인 보충이면 True (곡 연습일 때만)
    member_ids: list[int] = []      # 개인 보충에 함께하는 부원. 단체면 빈 목록

class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # SQLAlchemy 객체에서 값을 읽어올 수 있게

    id: int
    song_id: int | None
    song_title: str | None     # 모델의 @property에서 읽어옴
    title: str | None
    space: Space
    start_at: datetime
    end_at: datetime
    created_at: datetime | None
    updated_at: datetime | None     # 마지막 수정 시각 (수정한 적 없으면 null)
    slot_id: int | None             # 시간표로 만든 연습이면 블록 번호
    personal: bool                  # 개인 보충 여부
    member_ids: list[int]           # 함께하는 부원 (리더 포함). 모델의 @property 에서 읽어옴

class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gen: int
    name: str

class SongRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str

class SongMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    song_id: int
    member_id: int
    leader: bool
    
# ── 곡 일괄 등록 ──────────────────────────
class SongImportText(BaseModel):
    """미리보기 요청: 붙여넣은 글자 그대로"""
    text: str = Field(min_length=1)

class CandidateRead(BaseModel):
    id: int
    gen: int

class PreviewPerson(BaseModel):
    name: str
    leader: bool
    candidates: list[CandidateRead]     # 0명: 없음 / 1명: 확정 / 2명 이상: 동명이인

class ExistingMember(BaseModel):
    name: str
    gen: int
    leader: bool

class ExistingSong(BaseModel):
    id: int
    title: str
    members: list[ExistingMember]

class PreviewSong(BaseModel):
    title: str
    people: list[PreviewPerson]
    existing: list[ExistingSong]        # 제목이 같은 기존 곡 (없으면 빈 목록)

class ImportMember(BaseModel):
    """등록 요청: 확인이 끝나서 부원 번호가 정해진 멤버"""
    member_id: int
    leader: bool = False

class ImportSong(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=100)
    members: list[ImportMember] = Field(min_length=1)

class NoteIn(BaseModel):
    """메모 남길 때 받는 모양"""
    model_config = ConfigDict(str_strip_whitespace=True)

    date_on: date
    text: str = Field(min_length=1, max_length=200)

class NoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date_on: date
    text: str
    created_at: datetime

class FeedbackIn(BaseModel):
    """의견 보낼 때 받는 모양"""
    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=1000)

class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    created_at: datetime

class SlotIn(BaseModel):
    """시간표 블록 1개 (수정할 때 기존 블록이면 id, 새 블록이면 id 없음)
    곡 연습이면 song_id, 곡이 아닌 일정(돌리기 · 기본기)이면 title"""
    model_config = ConfigDict(str_strip_whitespace=True)

    id: int | None = None
    song_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=100)
    weekday: int = Field(ge=0, le=6)   # 0=일, 1=월, ... 6=토
    start_time: time
    end_time: time                     # 시작보다 이르면 다음 날 (00:00 = 자정)
    space: Space

class TimetableIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    starts_on: date
    ends_on: date
    slots: list[SlotIn] = Field(min_length=1)

class SlotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    song_id: int | None     # 곡 연습이면 번호
    title: str | None       # 곡이 아닌 일정이면 이름 ("기본기")
    weekday: int
    start_time: time
    end_time: time
    space: Space

class TimetableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    starts_on: date
    ends_on: date
    created_at: datetime
    updated_at: datetime | None
    slots: list[SlotRead]

# ── 공연 (곡 묶음) ──
class ShowIn(BaseModel):
    """공연 만들기 · 수정 때 받는 모양. song_ids 는 통째로 받아서 그대로 저장"""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    song_ids: list[int] = []      # 만들 때는 보통 빈 목록

class ShowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime
    song_ids: list[int]           # 모델의 @property 에서 읽어옴

# ── 로그인 ──
class LoginIn(BaseModel):
    gen: int = Field(ge=1, le=2_147_483_647)
    name: str = Field(min_length=1, max_length=30)
    password: SecretStr | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class PasswordChangeIn(BaseModel):
    current_password: SecretStr | None = None  # 처음 설정할 때는 안 보내요
    new_password: SecretStr

    @field_validator("new_password")
    @classmethod
    def four_digits(cls, value: SecretStr) -> SecretStr:
        if not re.fullmatch(r"[0-9]{4}", value.get_secret_value()):
            raise ValueError("비밀번호는 숫자 4자리로 입력해 주세요.")
        return value


# ── 타임픽 ──
class TimepickWeeklyCell(BaseModel):
    """매주 칸 하나: 무슨 요일, 몇 시 칸인지"""
    model_config = ConfigDict(from_attributes=True)

    weekday: int = Field(ge=0, le=6)   # 0=일 … 6=토
    start_time: time                   # 칸 시작 시각 ("16:30:00")

    @field_validator("start_time")
    @classmethod
    def half_hour(cls, value: time) -> time:
        # 칸은 30분 단위라 정각이나 30분만 받아요
        if value.minute not in (0, 30) or value.second or value.microsecond:
            raise ValueError("칸 시작 시각은 정각이나 30분이어야 해요.")
        return value


class TimepickDayCell(BaseModel):
    """이 날만 바꾼 칸 하나"""
    model_config = ConfigDict(from_attributes=True)

    date_on: date
    start_time: time
    busy: bool        # True: 이 날만 안 됨 / False: 매주 칸을 이 날만 됨으로 덮기

    @field_validator("start_time")
    @classmethod
    def half_hour(cls, value: time) -> time:
        if value.minute not in (0, 30) or value.second or value.microsecond:
            raise ValueError("칸 시작 시각은 정각이나 30분이어야 해요.")
        return value


class TimepickRead(BaseModel):
    """한 사람의 타임픽 (GET /api/timepicks/me 가 돌려주는 모양)"""
    weekly: list[TimepickWeeklyCell]
    days: list[TimepickDayCell]


class TeamTimepickRead(TimepickRead):
    """팀 화면용: 누구의 타임픽인지 + 그 사람의 칸 (TimepickRead 를 물려받음)"""
    member_id: int
