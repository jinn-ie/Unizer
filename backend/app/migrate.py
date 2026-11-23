# 배포 때마다 실행하는 DB 정리 스크립트
# 실행: backend 폴더에서 python -m app.migrate   (서버에서는 deploy.sh 가 자동으로 실행)
#
# create_all 은 "없는 테이블"만 새로 만들고, 기존 테이블의 컬럼 추가 · 삭제는 못 함
# → 그런 변경을 아래 STEPS 에 함수로 하나씩 적어 두면, 아직 안 된 것만 골라서 실행
# 각 단계는 "이미 반영됐는지" 먼저 확인하므로 몇 번을 실행해도 안전함

from sqlalchemy import inspect, text

import app.models  # noqa: F401  테이블 정의를 Base 에 등록 (create_all 이 알 수 있게)
from app.database import Base, engine


def has_table(conn, table: str) -> bool:
    return inspect(conn).has_table(table)


def has_column(conn, table: str, column: str) -> bool:
    return column in [c["name"] for c in inspect(conn).get_columns(table)]


# ── 변경 단계 (위에서부터 차례로 실행) ──────────
# 함수는 실제로 바꿨으면 True, 이미 반영돼 있어서 건너뛰었으면 False 를 돌려줌
# 서버 DB 와 모든 로컬 DB 에 반영된 게 확인되면 지워도 됨 (새로 만드는 DB 는 create_all 이 이미 최신 구조로 만듦)

def drop_regular_practices(conn) -> bool:
    """2026-11-23 정규연습 테이블 삭제 (시간표로 대체)"""
    if not has_table(conn, "regular_practices"):
        return False
    conn.execute(text("DROP TABLE regular_practices"))
    return True


def add_reservation_slot_id(conn) -> bool:
    """2026-11-23 reservations.slot_id 추가 (연습 ↔ 시간표 블록 연결)"""
    if has_column(conn, "reservations", "slot_id"):
        return False
    conn.execute(text(
        "ALTER TABLE reservations ADD COLUMN slot_id INTEGER "
        "REFERENCES timetable_slots(id) ON DELETE SET NULL"
    ))
    return True


STEPS = [
    drop_regular_practices,
    add_reservation_slot_id,
]


def main():
    engine.echo = False  # 배포 로그가 SQL 로 도배되지 않게

    # 1. 없는 테이블 만들기 (새 기능의 테이블)
    Base.metadata.create_all(engine)

    # 2. 기존 테이블 변경 (하나라도 실패하면 전부 취소)
    with engine.begin() as conn:
        for step in STEPS:
            done = step(conn)
            print(f"  {'적용  ' if done else '건너뜀'} {step.__doc__}")

    print("DB 정리 완료")


if __name__ == "__main__":
    main()
