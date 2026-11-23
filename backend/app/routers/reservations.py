from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Reservation
from app.schemas import ReservationIn, ReservationRead
from app.services.conflicts import check_reservation

# 연습 (날짜 하나에 잡는 연습 1건. 시간표로 만든 연습도 여기서 하나씩 수정/삭제)
router = APIRouter(prefix="/api/reservations", tags=["연습"])


@router.get("", response_model=list[ReservationRead])                    # → GET /api/reservations
def list_reservations(db: Annotated[Session, Depends(get_db)]):
    stmt = select(Reservation).order_by(Reservation.start_at)
    return db.scalars(stmt).all()


@router.post("", response_model=ReservationRead, status_code=201)        # → POST /api/reservations
def create_reservation(data: ReservationIn, db: Annotated[Session, Depends(get_db)]):
    check_reservation(db, data)
    reservation = Reservation(**data.model_dump())
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
    for key, value in data.model_dump().items():
        setattr(reservation, key, value)
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

