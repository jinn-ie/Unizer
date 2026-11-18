# 개발용 연습 데이터를 넣는 스크립트
# 실행: backend 폴더에서 python -m app.seed

from datetime import date, datetime, time

from app.database import Base, engine, SessionLocal
from app.models import Member, Song, SongMember, RegularPractice, Reservation, Space

# 1. 테이블을 지우고 새로 만들기
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

# 2. 부원
heejung = Member(gen=42, name="김희정")
jihee = Member(gen=42, name="윤지희")
jonghoon = Member(gen=42, name="이종훈")
sehun = Member(gen=42, name="강세훈")
garim = Member(gen=42, name="감가림")
dohyeon = Member(gen=42, name="김도현")
minju = Member(gen=42, name="김민주")
yijun = Member(gen=42, name="송이준")
wonjung = Member(gen=42, name="신원정")
hyungho = Member(gen=42, name="신형호")
seojin = Member(gen=42, name="이서진")
jaehi = Member(gen=42, name="진제희")
doyeon = Member(gen=42, name="임도연")
tway = Member(gen=42, name="칫수뛔이")
seonyeong = Member(gen=42, name="허선영")
yeongchae = Member(gen=42, name="현영채")
minji = Member(gen=43, name="이민지")
seungmyeon = Member(gen=43, name="송승면")

members = [heejung, jihee, jonghoon, sehun, garim, dohyeon, 
           minju, yijun, wonjung, hyungho, seojin, jaehi,
           doyeon, tway, seonyeong, yeongchae, minji, seungmyeon]

# 3. 곡 (곡명으로 꺼내 쓰기 편하게 딕셔너리로)
song_titles = [
    "BAD", "Sweat", "TNT", "Fake It + Smooth Criminal",
    "Numb + Time Traveller", "쌔끈해 + Yeah!", "Come Over", "Runaway",
]
songs = {t: Song(title=t) for t in song_titles}

# 4. 곡 ↔ 부원 (번호 대신 객체로 연결)
song_members = [
    SongMember(song=songs["Runaway"], member=garim, leader=True),
    SongMember(song=songs["Runaway"], member=dohyeon),
    SongMember(song=songs["Runaway"], member=seojin),
    SongMember(song=songs["Runaway"], member=doyeon),
    SongMember(song=songs["Runaway"], member=minji),
    SongMember(song=songs["Come Over"], member=seonyeong, leader=True),
    SongMember(song=songs["Come Over"], member=minju),
    SongMember(song=songs["Come Over"], member=dohyeon),
    SongMember(song=songs["Come Over"], member=jihee),
    SongMember(song=songs["Come Over"], member=jaehi),
]

# 5. 보충
reservations = [
    Reservation(
        song=songs["Runaway"],
        space=Space.OUTSIDE_MIRROR,
        start_at=datetime(2026, 11, 9, 20, 0),
        end_at=datetime(2026, 11, 9, 21, 0)
    ),
    Reservation(
        song=songs["Runaway"],
        space=Space.DONGBANG,
        start_at=datetime(2026, 11, 12, 22, 0),
        end_at=datetime(2026, 11, 12, 22, 30)
    ),
    Reservation(
        song=songs["Numb + Time Traveller"],
        space=Space.DONGBANG,
        start_at=datetime(2026, 11, 8, 17, 30),
        end_at=datetime(2026, 11, 8, 19, 0)
    ),
    Reservation(
        title="돌리기",
        space=Space.DONGBANG,
        start_at=datetime(2026, 12, 4, 18, 0),
        end_at=datetime(2026, 12, 4, 19, 0),
    )
]

#6. 정규연습
NOV_START = date(2026, 11, 2)
NOV_END = date(2026, 11, 27)


def nov_regular(weekday, start_hour, end_hour, song=None, title=None):
    """11월 동방 정규연습 하나 만들기 (곡 연습이면 song, 공통 일정이면 title)"""
    return RegularPractice(
        song=song,
        title=title,
        weekday=weekday,
        start_time=time(start_hour, 0),
        end_time=time(end_hour, 0),
        space=Space.DONGBANG,
        starts_on=NOV_START,
        ends_on=NOV_END,
    )


regular_practices = [
    nov_regular(1, 18, 20, song=songs["BAD"]),                        # 월
    nov_regular(1, 20, 22, song=songs["Sweat"]),
    nov_regular(2, 18, 20, song=songs["TNT"]),                        # 화
    nov_regular(2, 20, 22, song=songs["Fake It + Smooth Criminal"]),
    nov_regular(3, 18, 20, song=songs["Numb + Time Traveller"]),      # 수
    nov_regular(3, 20, 22, song=songs["쌔끈해 + Yeah!"]),
    nov_regular(4, 18, 20, song=songs["Come Over"]),                  # 목
    nov_regular(4, 20, 22, song=songs["Runaway"]),
    nov_regular(5, 18, 19, title="돌리기"),                           # 금 (공통 일정)
]

# 3. DB에 저장
with SessionLocal() as session:    # 세션 열기 (with 블록이 끝나면 자동으로 닫힘)
    session.add_all(members)
    session.add_all(songs.values())
    session.add_all(song_members)
    session.add_all(regular_practices)
    session.add_all(reservations)  # 저장할 목록에 올리기 (아직 DB에 안 들어감)
    session.commit()               # 실제로 DB에 반영

print(
    f"부원 {len(members)}명, 곡 {len(songs)}개, 연습 {len(reservations)}개, "
    f"정규연습 {len(regular_practices)}개를 넣었어요."
)
