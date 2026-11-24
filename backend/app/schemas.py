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
