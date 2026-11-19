# 곡 + 멤버 글자를 읽어서, 등록 전에 DB 와 맞춰보는 로직

import re
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Member, Song, SongMember

TAG = re.compile(r"\(([^)]*)\)")   # 괄호 안 글자 찾기: "(L)" → "L"
GEN = re.compile(r"(\d+)\s*기")     # "43기" → 43


def apply_tags(person: dict, text: str) -> None:
    """괄호 표시 읽기: (L) 이면 리더, (43기) 면 기수 기억, 나머지((OB) 등)는 무시"""
    for tag in TAG.findall(text):
        tag = tag.strip()
        if tag.upper() == "L":
            person["leader"] = True
        elif m := GEN.fullmatch(tag):
            person["gen"] = int(m.group(1))


def parse_song_text(text: str) -> list[dict]:
    """
    빈 줄로 곡을 나누고, 곡마다 첫 줄은 제목, 나머지 줄은 멤버로 읽음
    → [{"title": "Runaway", "people": [{"name": "감가림", "leader": True, "gen": None}, ...]}, ...]
    """
    songs = []
    for block in re.split(r"\n\s*\n", text.strip()):          # 빈 줄 기준으로 곡 나누기
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        title, member_lines = lines[0], lines[1:]

        people = []
        for token in re.split(r"[\s,]+", " ".join(member_lines)):   # 띄어쓰기·쉼표로 사람 나누기
            if not token:
                continue
            if token.startswith("("):      # "이민지 (43기)" 처럼 띄어 쓴 괄호 → 앞사람 것
                if people:
                    apply_tags(people[-1], token)
                continue
            person = {"name": token.split("(")[0], "leader": False, "gen": None}
            apply_tags(person, token)
            people.append(person)

        songs.append({"title": title, "people": people})
    return songs


def build_preview(db: Session, text: str) -> list[dict]:
    """파싱한 결과를 DB 와 맞춰봄: 이름마다 부원 후보, 같은 제목의 기존 곡"""
    by_name = defaultdict(list)            # 이름 → 그 이름의 부원들 (동명이인이면 여러 명)
    for m in db.scalars(select(Member).order_by(Member.gen)):
        by_name[m.name].append(m)

    preview = []
    for song in parse_song_text(text):
        people = []
        for p in song["people"]:
            candidates = by_name.get(p["name"], [])
            if p["gen"] is not None:       # (42기) 라고 적혀 있으면 그 기수로 좁힘
                same_gen = [m for m in candidates if m.gen == p["gen"]]
                if same_gen:
                    candidates = same_gen
            people.append({
                "name": p["name"],
                "leader": p["leader"],
                "candidates": [{"id": m.id, "gen": m.gen} for m in candidates],
            })

        # 대소문자 무시하고 제목이 같은 기존 곡 + 그 곡의 멤버
        same_title = db.scalars(
            select(Song).where(func.lower(Song.title) == song["title"].lower())
        ).all()
        existing = []
        for s in same_title:
            rows = db.scalars(select(SongMember).where(SongMember.song_id == s.id)).all()
            existing.append({
                "id": s.id,
                "title": s.title,
                "members": [
                    {"name": r.member.name, "gen": r.member.gen, "leader": r.leader} for r in rows
                ],
            })

        preview.append({"title": song["title"], "people": people, "existing": existing})
    return preview
