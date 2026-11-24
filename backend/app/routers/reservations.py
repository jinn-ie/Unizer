from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reservation, ReservationMember
from app.schemas import ReservationIn, ReservationRead
from app.services.conflicts import check_reservation, personal_member_ids

# 연습 (날짜 하나에 잡는 연습 1건. 시간표로 만든 연습도 여기서 하나씩 수정/삭제)
router = APIRouter(prefix="/api/reservations", tags=["연습"])


@router.get("", response_model=list[ReservationRead])                    # → GET /api/reservations
def list_reservations(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Reservation).order_by(Reservation.start_at)
    return db.scalars(stmt).all()


@router.post("", response_model=ReservationRead, status_code=201)        # → POST /api/reservations
def create_reservation(data: ReservationIn, db: Annotated[Session, Depends(get_db)]):
    check_reservation(db, data)
    member_ids = personal_member_ids(db, data)
    # member_ids 는 테이블 컬럼이 아니라서 빼고 만들고, 연결 줄로 따로 넣음
    reservation = Reservation(**data.model_dump(exclude={"member_ids"}))
    reservation.member_links = [ReservationMember(member_id=m) for m in member_ids]
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation


@router.put("/{reservation_id}", response_model=ReservationRead)         # → PUT /api/reservations/{id}
def update_reservation(reservation_id: int, data: ReservationIn, db: Annotated[Session, Depends(get_db)]):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(404, "해당하는 연습이 없어요.")
    check_reservation(db, data, exclude_id=reservation_id)
    member_ids = personal_member_ids(db, data)
    for key, value in data.model_dump(exclude={"member_ids"}).items():
        setattr(reservation, key, value)

    # 함께하는 부원을 통째로 바꾸기 (공연의 곡 목록 바꾸기와 같은 방법)
    # 1. 계속 남는 사람의 연결만 남김 (빠진 사람의 연결은 delete-orphan 으로 지워짐)
    reservation.member_links = [link for link in reservation.member_links if link.member_id in member_ids]
    # 2. 새로 들어온 사람만 연결을 추가
    already = {link.member_id for link in reservation.member_links}
    for member_id in member_ids:
        if member_id not in already:
            reservation.member_links.append(ReservationMember(member_id=member_id))

    db.commit()
    db.refresh(reservation)
    return reservation


@router.delete("/{reservation_id}", status_code=204)                     # → DELETE /api/reservations/{id}
def delete_reservation(reservation_id: int, db: Annotated[Session, Depends(get_db)]):
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(404, "해당하는 연습이 없어요.")
    db.delete(reservation)
    db.commit()

