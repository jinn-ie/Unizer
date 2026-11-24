from datetime import timedelta
from hashlib import sha256
from secrets import token_urlsafe
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LoginSession, Member, now_kst
from app.schemas import LoginIn, MemberRead
from app.services.passwords import verify_password

router = APIRouter(prefix="/api/auth", tags=["로그인"])
COOKIE_NAME = "unizer_session"
SESSION_SECONDS = 60 * 60 * 24 * 7

Db = Annotated[Session, Depends(get_db)]
SessionCookie = Annotated[str | None, Cookie(alias=COOKIE_NAME)]


def hash_token(token: str) -> str:
    # DB에는 쿠키 원본을 저장하지 않아요.
    return sha256(token.encode("utf-8")).hexdigest()


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
