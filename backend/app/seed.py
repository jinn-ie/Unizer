# 개발용 연습 데이터를 넣는 스크립트
# 실행: backend 폴더에서 python -m app.seed
# 부원 / 곡 / 곡별 참여자는 backend/data/*.csv 에서 읽어옴 (엑셀로 편집 시 "CSV UTF-8"로 저장)

import csv
from datetime import date, datetime, time
from pathlib import Path

from app.database import Base, engine, SessionLocal
from app.models import Member, Song, SongMember, RegularPractice, Reservation, Space

DATA_DIR = Path(__file__).resolve().parent.parent / "data"   # backend/data


def read_csv(filename):
    """CSV 파일을 읽어서 [{칸이름: 값}, ...] 목록으로 돌려줌"""
    with (DATA_DIR / filename).open(encoding="utf-8-sig", newline="") as f:
        return [{k: v.strip() for k, v in row.items()} for row in csv.DictReader(f)]


def find(table, key, what):
    """이름으로 찾기. 없으면 CSV 오타일 가능성이 높으니 알아보기 쉬운 에러로 멈춤"""
    if key not in table:
        raise SystemExit(f"{what} '{key}'을(를) 찾을 수 없어요. CSV 철자를 확인하세요.")
    return table[key]


# 1. 테이블을 지우고 새로 만들기
Base.metadata.drop_all(engine)
Base.metadata.create_all(engine)

# 2. 부원 (data/members.csv: gen,name) → 이름으로 꺼내 쓰기 편하게 딕셔너리로
member_rows = read_csv("members.csv")
members = {row["name"]: Member(gen=int(row["gen"]), name=row["name"]) for row in member_rows}
if len(members) != len(member_rows):
    raise SystemExit("members.csv 에 같은 이름이 두 번 있어요. song_members.csv 에서 구분할 수 없으니 확인하세요.")

# 3. 곡 (data/songs.csv: title) → 곡명으로 꺼내 쓰기 편하게 딕셔너리로
songs = {row["title"]: Song(title=row["title"]) for row in read_csv("songs.csv")}

# 4. 곡 ↔ 부원 (data/song_members.csv: song,name,leader / 리더면 leader 칸에 O)
song_members = [
    SongMember(
        song=find(songs, row["song"], "곡"),
        member=find(members, row["name"], "부원"),
        leader=row["leader"].upper() == "O",
    )
    for row in read_csv("song_members.csv")
]

# 5. 보충
reservations = [
    Reservation(
        song=songs["Runaway"],
        space=Space.CONF_ROOM_1,
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


def nov_regular(weekday, start_hour, end_hour, song=None, title=None, space=Space.DONGBANG):
    """11월 동방 정규연습 하나 만들기 (곡 연습이면 song, 공통 일정이면 title)"""
    return RegularPractice(
        song=song,
        title=title,
        weekday=weekday,
        start_time=time(start_hour, 0),
        end_time=time(end_hour, 0),
        space=space,
        starts_on=NOV_START,
        ends_on=NOV_END,
    )


regular_practices = [
    nov_regular(1, 18, 20, song=songs["BAD"]),                        # 월
    nov_regular(1, 20, 22, song=songs["Sweat"]),
    nov_regular(2, 18, 20, song=songs["TNT"]),                        # 화
    nov_regular(2, 20, 22, song=songs["Fake it + Smooth Criminal"]),
    nov_regular(3, 18, 20, song=songs["Numb + Time Traveller"]),      # 수
    nov_regular(3, 20, 22, song=songs["쌔끈해 + Yeah!"]),
    nov_regular(4, 18, 20, song=songs["Come Over"]),                  # 목
    nov_regular(4, 20, 22, song=songs["Runaway"]),
    nov_regular(5, 17, 18, song=songs["샤랄라"]),
    nov_regular(5, 20, 21, song=songs["Bloody Paradise"]),
    nov_regular(3, 20, 22, song=songs["BEEP"], space=Space.OUTSIDE_MIRROR),       # 바깥거울
    nov_regular(1, 18, 20, song=songs["소리꾼"], space=Space.OUTSIDE_MIRROR),
    nov_regular(1, 20, 22, song=songs["Yesterday"], space=Space.OUTSIDE_MIRROR),
    nov_regular(5, 18, 20, title="돌리기"),                           # 금 (공통 일정)
]

# 3. DB에 저장
with SessionLocal() as session:    # 세션 열기 (with 블록이 끝나면 자동으로 닫힘)
    session.add_all(members.values())
    session.add_all(songs.values())
    session.add_all(song_members)
    session.add_all(regular_practices)
    session.add_all(reservations)  # 저장할 목록에 올리기 (아직 DB에 안 들어감)
    session.commit()               # 실제로 DB에 반영

print(
    f"부원 {len(members)}명, 곡 {len(songs)}개, 연습 {len(reservations)}개, "
    f"정규연습 {len(regular_practices)}개를 넣었어요."
)
