"""운영자가 등록된 부원의 로그인 비밀번호를 설정하거나 해제해요."""

import argparse
from getpass import getpass

from sqlalchemy import delete, select

from app.database import SessionLocal, engine
from app.models import LoginSession, Member, MemberPassword
from app.services.passwords import hash_password


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gen", type=int, help="부원 기수")
    parser.add_argument("name", help="부원 이름")
    parser.add_argument("--clear", action="store_true", help="비밀번호를 해제해요.")
    args = parser.parse_args()

    engine.echo = False  # 비밀번호 해시를 SQL 로그에 남기지 않아요.
    with SessionLocal() as db:
        member = db.scalar(select(Member).where(Member.gen == args.gen, Member.name == args.name.strip()))
        if member is None:
            parser.error("해당 기수와 이름의 부원을 찾지 못했어요.")

        if args.clear:
            db.execute(delete(MemberPassword).where(MemberPassword.member_id == member.id))
        else:
            password = getpass("새 비밀번호 (8~128자): ")
            if not 8 <= len(password) <= 128 or not password.strip():
                parser.error("비밀번호는 8~128자로 입력해 주세요.")
            if password != getpass("비밀번호 확인: "):
                parser.error("두 비밀번호가 일치하지 않아요.")
            db.merge(MemberPassword(member_id=member.id, password_hash=hash_password(password)))

        # 비밀번호를 바꾼 뒤에는 기존 브라우저에서도 다시 로그인해야 해요.
        db.execute(delete(LoginSession).where(LoginSession.member_id == member.id))
        db.commit()

    print("비밀번호를 해제했어요." if args.clear else "비밀번호를 설정했어요.")


if __name__ == "__main__":
    main()
