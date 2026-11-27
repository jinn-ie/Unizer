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
from app.services.activity import log
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["로그인"])
COOKIE_NAME = "unizer_session"
SESSION_SECONDS = 60 * 60 * 24 * 180

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


def logged_in_member(db: Session, token: str | None) -> Member:
    # 지금 로그인한 부원. 로그인 안 했으면 401 (연습 · 메모 · 시간표의 권한 확인에 써요)
    return db.get(Member, logged_in_session(db, token).member_id)


def optional_member(db: Session, token: str | None) -> Member | None:
    # 로그인했으면 그 부원, 안 했으면 None (로그인 없이도 되는 곡 · 공연의 활동 기록에 써요)
    session = db.get(LoginSession, hash_token(token)) if token else None
    if session is None or session.expires_at <= now_kst():
        return None
    return db.get(Member, session.member_id)


def require_admin(db: Session, token: str | None) -> Member:
    # 관리자가 아니면 403 (로그인 안 했으면 401). 관리자 페이지 API 에 써요.
    member = logged_in_member(db, token)
    if not member.is_admin:
        raise HTTPException(status_code=403, detail="관리자만 볼 수 있어요.")
    return member


def device_hint(request: Request) -> str:
    # 접속한 기기 종류를 짧게 (활동 기록용). 남이 내 이름으로 로그인했는지 알아보는 데 도움이 돼요.
    agent = request.headers.get("user-agent", "")
    for keyword, label in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
                           ("Windows", "Windows"), ("Macintosh", "Mac")):
        if keyword in agent:
            return label
    return "기타 기기"


@router.post("/login", response_model=MemberRead)
def login(data: LoginIn, request: Request, response: Response, db: Db, token: SessionCookie = None):
    member = db.scalar(select(Member).where(Member.gen == data.gen, Member.name == data.name))
    password = data.password.get_secret_value() if data.password else ""
    error = HTTPException(status_code=401, detail="기수, 이름 또는 비밀번호를 확인해 주세요.")

    def fail(reason: str) -> HTTPException:
        # 로그인 실패도 기록해요. (남의 이름으로 로그인하려는 시도를 알아챌 수 있게)
        # 오류로 끝나는 요청이라, 기록만 따로 저장(commit)한 뒤 오류를 돌려줘요.
        log(db, member, "로그인", "로그인 실패", f"{data.gen}기 {data.name} · {reason} · {device_hint(request)}")
        db.commit()
        return error

    if member is None:
        raise fail("없는 부원")
    if len(password) > 128:
        raise fail("비밀번호가 맞지 않음")

    checked_hash = member.password_hash  # None이면 비밀번호를 설정하지 않은 부원이에요.
    if checked_hash is None:
        if password:
            raise fail("비밀번호가 맞지 않음")
    elif not password or not verify_password(password, checked_hash):
        raise fail("비밀번호가 맞지 않음")

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
    log(db, member, "로그인", "로그인", device_hint(request))
    db.commit()
    response.set_cookie(
        COOKIE_NAME,
        new_token,
        max_age=SESSION_SECONDS,
        path="/api",
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
        member = optional_member(db, token)  # 지우기 전에 누구였는지 알아 둬요 (기록용)
        db.execute(delete(LoginSession).where(LoginSession.token_hash == hash_token(token)))
        if member is not None:
            log(db, member, "로그인", "로그아웃", device_hint(request))
        db.commit()
    response = Response(status_code=204)
    for path in ("/api", "/api/auth"):
        response.delete_cookie(
            COOKIE_NAME, path=path, httponly=True,
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

    # 기록: 처음 설정인지 바꾼 건지 (비밀번호 자체는 남기지 않아요)
    action = "비밀번호 설정" if member.password_hash is None else "비밀번호 변경"
    member.password_hash = hash_password(new_password)
    # 지금 이 기기만 남기고 다른 기기의 로그인은 끊어요.
    db.execute(delete(LoginSession).where(
        LoginSession.member_id == member.id,
        LoginSession.token_hash != session.token_hash,
    ))
    log(db, member, "로그인", action, "")
    db.commit()
