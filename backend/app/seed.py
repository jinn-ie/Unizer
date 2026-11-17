# 개발용 연습 데이터를 넣는 스크립트
# 실행: backend 폴더에서 python -m app.seed

from datetime import date, datetime, time

from app.database import Base, engine, SessionLocal
from app.models import RegularPractice, Reservation, Space

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

regular_practices = [
    # -- 버스킹 2차곡 시간표 --
    RegularPractice(
        title="BAD",
        weekday=1,
        start_time=time(18, 0),
        end_time=time(20, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="Sweat",
        weekday=1,
        start_time=time(20, 0),
        end_time=time(22, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="TNT",
        weekday=2,
        start_time=time(18, 0),
        end_time=time(20, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="Fake It + Smooth Criminal",
        weekday=2,
        start_time=time(20, 0),
        end_time=time(22, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="Numb + Time Traveller",
        weekday=3,
        start_time=time(18, 0),
        end_time=time(20, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="쌔끈해 + Yeah!",
        weekday=3,
        start_time=time(20, 0),
        end_time=time(22, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="Come Over",
        weekday=4,
        start_time=time(18, 0),
        end_time=time(20, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="Runaway",
        weekday=4,
        start_time=time(20, 0),
        end_time=time(22, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),
        RegularPractice(
        title="돌리기",
        weekday=5,
        start_time=time(18, 0),
        end_time=time(19, 0),
        space=Space.DONGBANG,
        starts_on=date(2026, 11, 2),
        ends_on=date(2026, 11, 27),
    ),


]

# 3. DB에 저장
with SessionLocal() as session:    # 세션 열기 (with 블록이 끝나면 자동으로 닫힘)
    session.add_all(regular_practices)
    session.add_all(reservations)  # 저장할 목록에 올리기 (아직 DB에 안 들어감)
    session.commit()               # 실제로 DB에 반영

print(f"정규연습 {len(regular_practices)}개, 연습 {len(reservations)}개를 넣었어요.")
