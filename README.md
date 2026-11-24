# Unizer
> UCDC 매니저 : 편하게 춤춰라 유디 !

댄스 동아리 연습 공간과 연습 일정을 관리하는 모바일 웹앱이에요.
누가 언제 어느 공간에서 연습하는지 주간 캘린더로 보고, 연습을 직접 잡을 수 있어요.
곡 탭에서 시간표(곡 · 요일 · 시간 · 장소 + 기간)를 짜면, 기간 안의 날짜마다 연습이 한 번에 등록돼요.

- **백엔드:** Python 3.12 · FastAPI · SQLAlchemy · SQLite
- **프론트엔드:** React · TypeScript · Vite (모바일 화면 기준)

팀은 **기능 단위로 한 명씩 맡아서** 프론트·백엔드를 함께 개발해요.
그래서 아래 [기능 지도](#기능-지도)를 보면 기능 하나에 해당하는 파일을 한 번에 찾을 수 있게 정리해 뒀어요.

---

## 로컬에서 실행하기

명령 프롬프트(cmd) 창을 두 개 열어서 백엔드와 프론트를 각각 띄워요. (아래 명령은 Windows cmd 기준, `rem` 줄은 설명이라 입력하지 않아도 돼요)

### 처음 한 번만

```bat
rem 백엔드
cd backend
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt
rem 테이블 만들고 부원 목록(data/members.csv) 넣기
python -m app.seed

rem 프론트엔드 (다른 cmd 창)
cd frontend
npm install
```

### 매번

```bat
rem cmd 창 1 — 백엔드 (http://127.0.0.1:8000)
cd backend
.venv\Scripts\activate.bat
uvicorn app.main:app --reload

rem cmd 창 2 — 프론트엔드 (http://localhost:5173)
cd frontend
npm run dev
```

가상환경이 켜지면 줄 앞에 `(.venv)`가 붙어요. 끌 때는 `deactivate`를 입력하면 돼요.

브라우저에서 http://localhost:5173 을 열면 돼요.

- 백엔드는 **꼭 `backend` 폴더 안에서** 실행하세요. DB 파일 경로가 `./unizer.db`라서, 다른 곳에서 실행하면 빈 DB가 새로 생겨요.
- 백엔드 포트는 **8000 그대로** 두세요. 프론트가 `/api` 요청을 8000번으로 넘겨요. (`frontend/vite.config.ts`)
- http://127.0.0.1:8000/docs 에서 API 목록을 보고 직접 호출해 볼 수 있어요.
- 로컬 `unizer.db`는 테스트용이에요. 진짜 데이터는 서버에 있어요.
- `git pull`로 다른 사람이 바꾼 코드를 받은 뒤에는 `python -m app.migrate`를 한 번 실행해요. DB 구조가 바뀌었으면 로컬 DB에도 반영돼요. (이미 최신이면 아무것도 안 해요)

---

## 폴더 구조

```
backend/
  app/
    main.py              앱 생성 + 라우터 등록
    database.py          DB 연결
    models.py            테이블 정의 (모든 기능 공용)
    schemas.py           API 입출력 형식 (모든 기능 공용)
    routers/             기능별 API  ← 기능 하나 = 파일 하나
    services/            여러 API가 같이 쓰는 로직 (시간 겹침 검사, 시간표 → 연습 만들기)
    seed.py              테이블 만들기 + 부원 넣기
    migrate.py           배포 때 DB 구조 변경을 자동 반영
    song_import.py       곡 붙여넣기 파싱
  data/members.csv       부원 명단

frontend/
  src/
    App.tsx              상단 탭 목록
    pages/               기능별 화면  ← 기능 하나 = 폴더 하나
    components/          여러 화면이 같이 쓰는 부품 (Toast, 휠 선택기, 사람 아이콘)
    lib/                 날짜 계산, 공간 목록 같은 도우미
    api.ts               백엔드 호출 함수 (모든 기능 공용)
    types.ts             타입 정의 (모든 기능 공용)
    index.css            색상 · 글꼴 · 레이아웃 등 전체 공통 스타일
```

컴포넌트 스타일은 같은 이름의 `.css` 파일에 있어요. (예: `DaySheet.tsx` ↔ `DaySheet.css`)

---

## 기능 지도

| 기능 | 화면(탭) | 프론트 | 백엔드 | 테이블 | 담당 |
|---|---|---|---|---|---|
| **연습 공간** — 주간 캘린더, 연습 등록·수정·삭제, 날짜별 메모 | 연습 공간 | `pages/schedule/` | `routers/reservations.py`<br>`routers/notes.py`<br>`services/conflicts.py` | `reservations`<br>`notes` | jinn-ie |
| **곡** — 곡 목록, 붙여넣기로 곡 등록, 시간표 등록·수정·삭제 | 곡 | `pages/data/` (`DataPage`, `SongImport`, `TimetableBuilder`) | `routers/songs.py`<br>`routers/timetables.py`<br>`services/timetables.py`<br>`song_import.py` | `songs`<br>`song_members`<br>`timetables`<br>`timetable_slots` | jinn-ie |
| **내 연습** — 내가 멤버인 곡의 연습만 주별 시간표로 (로그인 필요) | 내 연습 | `pages/mypractice/` (`MyPracticePage`)<br>`pages/schedule/` 의 `WeekCalendar`, `WeekNav`, `DaySheet` 를 같이 씀 | `routers/reservations.py`<br>`routers/songs.py` | `reservations`<br>`song_members` | |
| **의견 보내기** | 의견 보내기 | `pages/feedback/` | `routers/feedback.py` | `feedbacks` | jinn-ie |
| **로그인** — 기수·이름(+ 숫자 4자리 비밀번호)으로 로그인, 로그인 상태 확인 | 상단 로그인 | `pages/auth/` | `routers/auth.py`, `member_password.py` | `members.password_hash`<br>`login_sessions` | |
| **마이페이지** — 내 정보, 로그아웃, 비밀번호 설정·변경, 내 정규 일정(지금은 빈 시간표) | 상단 사람 아이콘 + ㅇㅇㅇ님 | `pages/mypage/` (`MyPage`, `PasswordForm`, `MyTimetable`) | `routers/auth.py` | `members.password_hash`<br>`login_sessions` | |

새 기능을 만들면 이 표에 한 줄 추가해 주세요.

### 부원 로그인

등록된 기수와 이름으로 로그인해요. 비밀번호는 `members.password_hash`에 해시로 저장하고, 값이 비어 있으면(`NULL`) 기수와 이름만으로 로그인해요. 비밀번호는 **숫자 4자리**로 정해져 있고, 비밀번호가 있는 부원은 로그인할 때 비밀번호도 입력해요. 기수와 이름만으로 로그인하는 계정은 명단을 아는 사람도 사용할 수 있어요. 로그인 상태는 브라우저에서 7일간 유지되며, 기존 화면은 로그인 없이 이용할 수 있어요.

로그인하면 상단 버튼이 사람 아이콘 + **ㅇㅇㅇ님**으로 바뀌고, 누르면 **마이페이지**로 들어가요. 마이페이지에서 비밀번호를 직접 설정하거나 바꿀 수 있어요. 그 아래 **내 정규 일정**(학교 수업, 알바처럼 매주 반복되는 일정)은 지금은 빈 주간 시간표이고, 시간 범위는 '연습 공간'과 같아요. (`lib/schedule.ts`의 `CAL_…` 값을 같이 써요.)

- 비밀번호가 없으면 새 비밀번호만 입력해 바로 설정해요. 그래서 먼저 로그인한 다른 사람이 대신 설정할 수도 있어요. 그런 일이 생기면 운영자가 아래 `--clear` 명령으로 풀어 줘요.
- 비밀번호가 있으면 현재 비밀번호가 맞아야 바꿀 수 있어요.
- 설정하거나 바꾸면 지금 쓰는 기기만 남기고 다른 기기의 로그인이 풀려요.

운영자는 로컬 DB를 백업한 뒤 `backend` 폴더에서 `python -m app.migrate`를 실행해 DB 구조를 최신으로 맞추고, 같은 폴더에서 예시 기수와 이름을 실제 부원 정보로 바꿔 비밀번호를 설정하거나 해제해요.

```bat
python -m app.member_password 42 "부원 이름"
python -m app.member_password 42 "부원 이름" --clear
```

설정 명령을 실행하면 비밀번호(숫자 4자리)를 입력하는 프롬프트가 표시돼요. 비밀번호를 설정하거나 해제하면 그 부원은 다시 로그인해야 해요.

### 연습과 시간표의 관계

- 연습 1건 = `reservations` 1행 (날짜 · 시간 · 장소 · 곡 또는 일정 이름). 캘린더에 보이는 건 전부 이거예요.
- 시간표(`timetables`)는 블록(`timetable_slots`, 예: 화 19:00~21:00 BAD 동방)의 묶음이에요. 등록하면 블록마다 기간 안의 그 요일에 연습이 만들어지고, 각 연습의 `slot_id`가 그 블록을 가리켜요.
- 시간표를 **고치면** 바뀐 블록의 연습만, **지우면** 그 시간표의 연습 전부가 기간 전체(지난 날짜 포함)에서 다시 만들어지거나 지워져요.
- 블록은 곡(`song_id`) 또는 일정 이름(`title`: 돌리기 · 기본기) 중 하나예요.

---

## 새 기능 추가 순서

예시로 `events`(행사)라는 기능을 만든다고 할게요.

**백엔드**
1. `models.py` — 맨 아래에 테이블 클래스 추가
2. `schemas.py` — 맨 아래에 입출력 형식 추가 (`EventIn`, `EventRead` 등)
3. `routers/events.py` — 새 파일. `routers/notes.py`가 가장 짧아서 따라 만들기 좋아요.
   ```python
   router = APIRouter(prefix="/api/events", tags=["행사"])
   ```
4. `main.py` — `app.include_router(events.router)` 한 줄 추가
5. `python -m app.migrate` — 새 테이블을 로컬 DB에 만들어요. (없는 테이블만 만들고 기존 데이터는 그대로예요. 서버는 배포할 때 자동)
6. http://127.0.0.1:8000/docs 에서 직접 호출해 보기

**프론트엔드**

7. `types.ts` — 맨 아래에 타입 추가
8. `api.ts` — 맨 아래에 호출 함수 추가
9. `pages/events/EventsPage.tsx` (+ `EventsPage.css`) — 새 폴더
10. `App.tsx` — `TABS`에 탭 추가하고 화면 연결

---

## 같이 쓰는 파일 규칙

여러 기능이 같이 쓰는 파일은 두 사람이 동시에 고치기 쉬워요. 충돌을 줄이려고 이렇게 해요.

| 파일 | 규칙 |
|---|---|
| `models.py`, `schemas.py`, `api.ts`, `types.ts` | 새 기능은 **맨 아래에** `# ── 기능 이름 ──` 주석을 달고 추가. 다른 기능 부분은 고치지 않기 |
| `main.py`, `App.tsx` | 라우터 등록 / 탭 추가 **한두 줄만** 추가 |
| `index.css`, `components/`, `lib/` | 모든 화면에 영향이 가니까 **고치기 전에 먼저 말하기** |
| `lib/spaces.ts` ↔ `models.py`의 `Space` | 공간 목록과 **순서**(동방 → 바깥거울 → 대회의실1 → 대회의실2)는 두 곳이 같아야 해요. 순서는 캘린더 세로줄 순서이기도 해요. 바꿀 땐 둘 다 |

### ⚠️ 테이블 구조를 바꿀 땐

배포할 때마다 `python -m app.migrate`(`backend/app/migrate.py`)가 자동으로 돌아요.

- **새 테이블 추가:** 그냥 `models.py`에 추가하면 돼요. migrate 가 없는 테이블을 만들어 줘요. (로컬에서는 `python -m app.seed` 또는 `python -m app.migrate`)
- **기존 테이블 수정** (컬럼 추가 · 삭제 · 이름 변경): `create_all`로는 안 돼서, **`migrate.py`의 `STEPS`에 단계를 하나 추가**해요. 다른 기능의 데이터에 영향이 갈 수 있으니 **작업 전에 먼저 이야기해 주세요.**
  - 단계 함수는 "이미 반영됐으면 건너뛰기"로 써야 해요. (파일 안의 예시 `add_reservation_memo` 참고)
  - 로컬 DB에도 `python -m app.migrate`를 한 번 실행해서 반영해요. (먼저 `unizer.db`를 복사해 백업)
  - 서버 DB와 모든 로컬 DB에 반영된 게 확인된 단계는 지워도 돼요.

---

## 브랜치 · 커밋 규칙

`main`은 **서버에 올라가는 코드**예요. `main`에 직접 커밋하지 않고, 브랜치에서 작업한 뒤 합쳐요.

### 흐름

```bat
git switch main
rem 최신 main 받기
git pull
rem 작업 브랜치 만들기
git switch -c feat/events

rem ... 작업하고 커밋 ...
```

**지금처럼 혼자 작업할 때:** PR 없이 바로 `main`에 합치고 올려요.
```bat
git switch main
git merge --ff-only feat/events
git push
git branch -d feat/events
```

**팀원이 생기면:** `git push -u origin feat/events`로 브랜치를 올린 뒤
1. GitHub에서 `feat/events` → `main`으로 **PR(Pull Request)** 을 만들어요.
2. **다른 한 명이 확인**하고 머지해요. (기능 담당자가 아니어도 화면이 잘 뜨는지 정도는 같이 봐요)
3. 머지한 뒤에는 로컬 브랜치를 정리해요: `git switch main` → `git pull` → `git branch -d feat/events`

작업이 길어지면 중간중간 `main`의 최신 내용을 받아오세요.
```bat
git switch feat/events
git merge main
```

### 브랜치 이름

| 접두어 | 언제 | 예시 |
|---|---|---|
| `feat/` | 새 기능 | `feat/events` |
| `fix/` | 버그 수정 | `fix/reservation-overlap` |
| `refactor/` | 동작은 그대로, 구조만 정리 | `refactor/folder-structure` |
| `chore/` | 설정, 문서, 기타 | `chore/readme` |

### 커밋 메시지

`종류(범위): 무엇을 했는지` 형식으로 한국어로 써요.

```
feat(backend): 행사 목록 API 추가
feat(frontend): 행사 탭 화면 추가
fix(frontend): 보충 수정 시 시간이 초기화되는 문제 수정
```

- **종류:** `feat` 새 기능 · `fix` 버그 수정 · `refactor` 구조 정리 · `chore` 설정·문서
- **범위:** `backend` 또는 `frontend`
- **커밋은 수정 단위로 나눠요.** 여러 작업을 한 커밋에 뭉치지 말고, 변경 하나(예: "공간 순서 변경", "시간표 API 추가")마다 커밋해요. 나중에 확인하거나 되돌리기 쉬워요.

---

## 배포

서버(Oracle Cloud) 한 대에 nginx + uvicorn + SQLite로 올라가 있어요.

### 자동 배포 (GitHub Actions)

**`main`에 푸시하면 자동으로 배포돼요.** 서버에 접속할 필요 없어요. (`.github/workflows/deploy.yml`)

1. **검사:** 백엔드 import · 프론트 빌드 · lint. 하나라도 실패하면 배포하지 않아요.
2. **배포:** GitHub가 SSH로 서버에 접속해서 `~/deploy.sh`를 실행해요.
   DB 백업 → `git pull` → `pip install` → **DB 정리(`python -m app.migrate`)** → 백엔드 재시작 → 프론트 빌드 → nginx 폴더(`/var/www/unizer`)로 복사

- 진행 상황과 로그는 GitHub 저장소의 **Actions** 탭에서 봐요. 실패하면 빨간 X가 떠요.
- 문서(`*.md`, `ERD.txt`)만 바뀐 푸시는 배포하지 않아요.
- 손으로 다시 돌리려면 Actions 탭 → "배포" → **Run workflow**.
- 서버 접속 정보(주소 · 사용자 · 배포용 SSH 키)는 저장소 Settings → Secrets 의 `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY`에 있어요.

자동 배포가 안 될 때는 서버에 접속해서 `~/deploy.sh`를 직접 실행해도 돼요. (서버 venv 폴더 이름은 점 없이 `venv`예요)

로컬 DB 파일을 서버로 올리면 진짜 데이터가 덮어써지니까 절대 올리지 마세요.
