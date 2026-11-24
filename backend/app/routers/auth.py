from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoginSession, Member, now_kst
from app.schemas import LoginIn, MemberRead, PasswordChangeIn
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["로그인"])
COOKIE_NAME = "unizer_session"
SESSION_SECONDS = 60 * 60 * 24 * 7

Db = Annotated[Session, Depends(get_db)]
SessionCookie = Annotated[str | None, Cookie(alias=COOKIE_NAME)]


def hash_token(token: str) -> str:
    # DB에는 쿠키 원본을 저장하지 않아요.
    return sha256(token.encode("utf-8")).hexdigest()


def logged_in_session(db: Session, token: str | None) -> LoginSession:
    # 쿠키로 지금 로그인한 세션을 찾고, 없거나 만료됐으면 401을 내요.
    session = db.get(LoginSession, hash_token(token)) if token else None
    if session is None or session.expires_at <= now_kst():
        raise HTTPException(status_code=401, detail="로그인이 필요해요.")
    return session


@router.post("/login", response_model=MemberRead)
def login(data: LoginIn, request: Request, response: Response, db: Db, token: SessionCookie = None):
    member = db.scalar(select(Member).where(Member.gen == data.gen, Member.name == data.name))
    password = data.password.get_secret_value() if data.password else ""
    error = HTTPException(status_code=401, detail="기수, 이름 또는 비밀번호를 확인해 주세요.")
    if member is None or len(password) > 128:
        raise error

    checked_hash = member.password_hash  # None이면 비밀번호를 설정하지 않은 부원이에요.
    if checked_hash is None:
        if password:
            raise error
    elif not password or not verify_password(password, checked_hash):
        raise error

    now = now_kst()
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    # 쓰기 잠금을 얻은 뒤 다시 확인해요. 검증하는 동안 운영자가 비밀번호를 바꿀 수 있어요.
    current_hash = db.scalar(select(Member.password_hash).where(Member.id == member.id))
    if current_hash != checked_hash:
        raise error
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == hash_token(token)))

    new_token = token_urlsafe(32)
    db.add(LoginSession(
        token_hash=hash_token(new_token),
        member_id=member.id,
        expires_at=now + timedelta(seconds=SESSION_SECONDS),
    ))
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        new_token,
        max_age=SESSION_SECONDS,
        path="/api/auth",
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    response.headers["Cache-Control"] = "no-store"
    return member


@router.get("/me", response_model=MemberRead | None)
def current_member(response: Response, db: Db, token: SessionCookie = None):
    response.headers["Cache-Control"] = "no-store"
    if not token:
        return None
    session = db.get(LoginSession, hash_token(token))
    if session is None or session.expires_at <= now_kst():
        return None
    return db.get(Member, session.member_id)


@router.post("/logout", status_code=204)
def logout(request: Request, db: Db, token: SessionCookie = None):
    if token:
        db.execute(delete(LoginSession).where(LoginSession.token_hash == hash_token(token)))
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        COOKIE_NAME, path="/api/auth", httponly=True,
        secure=request.url.scheme == "https", samesite="lax",
    )
    return response


# 비밀번호가 설정돼 있는지 알려줘요. (마이페이지의 제목과 입력칸이 달라져요.)
@router.get("/password")
def password_status(db: Db, token: SessionCookie = None):
    session = logged_in_session(db, token)
    member = db.get(Member, session.member_id)
    return {"has_password": member.password_hash is not None}


# 처음 설정은 바로 되고, 이미 있으면 현재 비밀번호가 맞아야 바꿀 수 있어요.
@router.put("/password", status_code=204)
def change_password(data: PasswordChangeIn, db: Db, token: SessionCookie = None):
    session = logged_in_session(db, token)
    member = db.get(Member, session.member_id)
    new_password = data.new_password.get_secret_value()

    if member.password_hash is not None:
        current = data.current_password.get_secret_value() if data.current_password else ""
        if not current or len(current) > 128 or not verify_password(current, member.password_hash):
            raise HTTPException(status_code=400, detail="현재 비밀번호가 맞지 않아요.")

    member.password_hash = hash_password(new_password)
    # 지금 이 기기만 남기고 다른 기기의 로그인은 끊어요.
    db.execute(delete(LoginSession).where(
        LoginSession.member_id == member.id,
        LoginSession.token_hash != session.token_hash,
    ))
    db.commit()
