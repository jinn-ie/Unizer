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
#
# 예시: 기존 테이블에 컬럼 추가
#
# def add_reservation_memo(conn) -> bool:
#     """2026-12-01 reservations.memo 추가 (연습마다 한 줄 메모)"""
#     if has_column(conn, "reservations", "memo"):
#         return False                       # 이미 있음 → 건너뜀
#     conn.execute(text("ALTER TABLE reservations ADD COLUMN memo VARCHAR(200)"))
#     return True
#
# 테이블 삭제는 has_table 로 확인:  if not has_table(conn, "옛_테이블"): return False
#
# 반영 끝나서 지운 단계: 2026-11-23 regular_practices 삭제, reservations.slot_id 추가

def move_passwords_to_members(conn) -> bool:
    """2026-11-23 member_passwords 테이블 → members.password_hash 컬럼으로 옮김"""
    changed = False

    # 1. 컬럼 추가: member_passwords 테이블이 없던 DB(로그인 기능 전 DB)에도 컬럼은 있어야 해요.
    if not has_column(conn, "members", "password_hash"):
        conn.execute(text("ALTER TABLE members ADD COLUMN password_hash VARCHAR(96)"))
        changed = True

    # 2. 옛 테이블이 남아 있으면, 비밀번호가 있는 부원만 해시를 복사한 뒤 테이블을 지워요.
    #    (복사 → 삭제 순서가 중요해요. 거꾸로 하면 설정해 둔 비밀번호가 사라져요.)
    if has_table(conn, "member_passwords"):
        conn.execute(text("""
            UPDATE members
            SET password_hash = (
                SELECT password_hash FROM member_passwords
                WHERE member_passwords.member_id = members.id
            )
            WHERE id IN (SELECT member_id FROM member_passwords)
        """))
        conn.execute(text("DROP TABLE member_passwords"))
        changed = True

    return changed

def add_reservation_personal(conn) -> bool:
    """2026-11-24 reservations.personal 추가 (개인 보충 여부)"""
    if has_column(conn, "reservations", "personal"):
        return False                       # 이미 있음 → 건너뜀
    # 이미 있던 연습은 전부 단체 → DEFAULT 0 (False) 으로 채움
    conn.execute(text("ALTER TABLE reservations ADD COLUMN personal BOOLEAN NOT NULL DEFAULT 0"))
    return True

def add_reservation_created_by(conn) -> bool:
    """2026-11-27 reservations.created_by 추가 (연습을 등록한 부원)"""
    if has_column(conn, "reservations", "created_by"):
        return False                       # 이미 있음 → 건너뜀
    # 이미 있던 연습은 누가 등록했는지 모르니 비워 둠 (NULL) → 관리자만 고칠 수 있음
    conn.execute(text("ALTER TABLE reservations ADD COLUMN created_by INTEGER REFERENCES members(id)"))
    return True

def add_note_created_by(conn) -> bool:
    """2026-11-27 notes.created_by 추가 (메모를 남긴 부원)"""
    if has_column(conn, "notes", "created_by"):
        return False                       # 이미 있음 → 건너뜀
    conn.execute(text("ALTER TABLE notes ADD COLUMN created_by INTEGER REFERENCES members(id)"))
    return True

STEPS = [
    # add_reservation_memo,
    move_passwords_to_members,
    add_reservation_personal,
    add_reservation_created_by,
    add_note_created_by,
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
