from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict, Field
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
    updated_at: datetime | None    # 마지막 수정 시각 (수정한 적 없으면 null)

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

class RegularPracticeIn(BaseModel):
    """정규연습 등록 때 받는 모양 (곡 연습이면 song_id, 공통 일정이면 title)"""
    model_config = ConfigDict(str_strip_whitespace=True)

    song_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=100)
    weekday: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    space: Space
    starts_on: date
    ends_on: date


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
