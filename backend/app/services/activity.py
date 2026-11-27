"""활동 기록 남기기 + 기록에 쓸 한 줄 요약 만들기 (관리자 페이지에서 봐요)

기록은 각 API 의 db.commit() 전에 add 해요.
→ 본래 작업과 같이 저장되고, 작업이 실패하면 기록도 같이 취소돼요.
"""
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ActivityLog, Member, Song, now_kst

WEEKDAY_NAMES = "월화수목금토일"   # 파이썬 weekday(): 월=0 … 일=6
MERGE_MINUTES = 10                 # 타임픽처럼 자주 저장되는 건 이 시간 안이면 한 줄로 합쳐요


def log(
    db: Session,
    member: Member | None,
    kind: str,
    action: str,
    summary: str,
    merge: bool = False,
) -> None:
    """기록 한 줄 추가. merge=True 면 같은 사람의 바로 앞 기록이 똑같은 내용이고
    MERGE_MINUTES 안이면 새로 쌓지 않고 시각만 지금으로 바꿔요. (자동 저장이 여러 번 와도 한 줄)"""
    member_id = member.id if member else None
    now = now_kst()
    if merge and member_id is not None:
        last = db.scalar(
            select(ActivityLog)
            .where(ActivityLog.member_id == member_id)
            .order_by(ActivityLog.id.desc())
            .limit(1)
        )
        if (
            last is not None
            and (last.kind, last.action, last.summary) == (kind, action, summary)
            and last.created_at >= now - timedelta(minutes=MERGE_MINUTES)
        ):
            last.created_at = now
            return
    db.add(ActivityLog(member_id=member_id, kind=kind, action=action, summary=summary[:300]))


# ── 한 줄 요약 ──

def short_date(d: date) -> str:
    """2026-11-30 → "11/30(일)" """
    return f"{d:%m/%d}({WEEKDAY_NAMES[d.weekday()]})"


def practice_summary(db: Session, p) -> str:
    """연습 1건 요약: "11/30(일) 19:00–21:00 · 동방 · BAD (개인)"
    p 는 Reservation 이나 ReservationIn (둘 다 song_id · title · space · start_at · end_at 이 있어요)"""
    start: datetime = p.start_at
    end: datetime = p.end_at
    song = db.get(Song, p.song_id) if p.song_id is not None else None
    name = song.title if song else (p.title or "")
    personal = " (개인)" if getattr(p, "personal", False) else ""
    return f"{short_date(start.date())} {start:%H:%M}–{end:%H:%M} · {p.space} · {name}{personal}"


def change_summary(before: str, after: str) -> str:
    """수정 기록: 바뀌었으면 "전 → 후", 그대로면 하나만 (함께하는 부원만 바꾼 경우 등)"""
    return before if before == after else f"{before} → {after}"


def period_summary(name: str, starts_on: date, ends_on: date) -> str:
    """시간표 요약: "'2026 버스킹 2차곡' 11/02 – 11/29" """
    return f"'{name}' {starts_on:%m/%d} – {ends_on:%m/%d}"


def member_label(member: Member) -> str:
    """"42기 이서진" """
    return f"{member.gen}기 {member.name}"
