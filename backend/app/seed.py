# 개발용 연습 데이터를 넣는 스크립트
# 실행: backend 폴더에서 python -m app.seed

from datetime import datetime

from app.database import Base, engine, SessionLocal
from app.models import Reservation, Space

# 1. 테이블을 지우고 새로 만들기
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

# 2. 연습 데이터 준비
reservations = [
    Reservation(
        space=Space.OUTSIDE_MIRROR,
        song_title="Runaway",
        start_at=datetime(2026, 11, 9, 20, 0),
        end_at=datetime(2026, 11, 9, 21, 0)
    ),
    Reservation(
        space=Space.DONGBANG,
        song_title="Runaway",
        start_at=datetime(2026, 11, 12, 22, 0),
        end_at=datetime(2026, 11, 12, 22, 30)
    ),
    Reservation(
        space=Space.DONGBANG,
        song_title="Numb + Time Traveller",
        start_at=datetime(2026, 11, 8, 17, 30),
        end_at=datetime(2026, 11, 8, 19, 0)
    )
]

# 3. DB에 저장
with SessionLocal() as session:    # 세션 열기 (with 블록이 끝나면 자동으로 닫힘)
    session.add_all(reservations)  # 저장할 목록에 올리기 (아직 DB에 안 들어감)
    session.commit()               # 실제로 DB에 반영

print(f"예약 {len(reservations)}개를 넣었어요.")
