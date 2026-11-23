# 개발용 기본 데이터를 넣는 스크립트
# 실행: backend 폴더에서 python -m app.seed
#
# 화면에서 등록할 수 있는 정보(곡·곡 멤버, 연습)는 여기서 넣지 않음
# → 부원만 backend/data/members.csv 에서 읽어서 넣음 (엑셀로 편집 시 "CSV UTF-8"로 저장)
#
# 기존 DB 를 지우지 않음: 테이블이 없으면 만들고, DB 에 없는 부원(기수 + 이름 기준)만 추가
# → 여러 번 실행해도 안전하고, 화면에서 등록한 데이터도 그대로 남음

import csv
from pathlib import Path

from sqlalchemy import select

from app.database import Base, engine, SessionLocal
from app.models import Member

DATA_DIR = Path(__file__).resolve().parent.parent / "data"   # backend/data


def read_csv(filename):
    """CSV 파일을 읽어서 [{칸이름: 값}, ...] 목록으로 돌려줌"""
    with (DATA_DIR / filename).open(encoding="utf-8-sig", newline="") as f:
        return [{k: v.strip() for k, v in row.items()} for row in csv.DictReader(f)]


# 1. 없는 테이블만 만들기 (이미 있는 테이블과 데이터는 건드리지 않음)
Base.metadata.create_all(engine)

# 2. 부원 (data/members.csv: gen,name)
#    동명이인(예: 40기 김도현, 42기 김도현)은 기수가 다르니 서로 다른 사람으로 들어감
rows = [(int(row["gen"]), row["name"]) for row in read_csv("members.csv")]

with SessionLocal() as session:    # 세션 열기 (with 블록이 끝나면 자동으로 닫힘)
    existing = {(m.gen, m.name) for m in session.scalars(select(Member))}
    new_members = [Member(gen=gen, name=name) for gen, name in rows if (gen, name) not in existing]
    session.add_all(new_members)   # 저장할 목록에 올리기 (아직 DB에 안 들어감)
    session.commit()               # 실제로 DB에 반영

print(f"새 부원 {len(new_members)}명을 넣었어요. (CSV {len(rows)}명 중 {len(rows) - len(new_members)}명은 이미 있음)")
