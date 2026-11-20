# Unizer
> UCDC 매니저 : 편하게 춤춰라 유디 !

댄스 동아리 연습 공간과 연습 일정을 관리하는 모바일 웹앱이에요.
누가 언제 어느 공간에서 연습하는지 주간 캘린더로 보고, 보충 연습을 직접 잡을 수 있어요.

- **백엔드:** Python 3.12 · FastAPI · SQLAlchemy · SQLite
- **프론트엔드:** React · TypeScript · Vite (모바일 화면 기준)

팀은 **기능 단위로 한 명씩 맡아서** 프론트·백엔드를 함께 개발해요.
그래서 아래 [기능 지도](#기능-지도)를 보면 기능 하나에 해당하는 파일을 한 번에 찾을 수 있게 정리해 뒀어요.

---

## 로컬에서 실행하기

터미널을 두 개 열어서 백엔드와 프론트를 각각 띄워요. (아래 명령은 Windows PowerShell 기준)

### 처음 한 번만

```powershell
# 백엔드
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed          # 테이블 만들고 부원 목록(data/members.csv) 넣기

# 프론트엔드 (다른 터미널)
cd frontend
npm install
```

### 매번

```powershell
# 터미널 1 — 백엔드 (http://127.0.0.1:8000)
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload

# 터미널 2 — 프론트엔드 (http://localhost:5173)
cd frontend
npm run dev
```

브라우저에서 http://localhost:5173 을 열면 돼요.

- 백엔드는 **꼭 `backend` 폴더 안에서** 실행하세요. DB 파일 경로가 `./unizer.db`라서, 다른 곳에서 실행하면 빈 DB가 새로 생겨요.
- 백엔드 포트는 **8000 그대로** 두세요. 프론트가 `/api` 요청을 8000번으로 넘겨요. (`frontend/vite.config.ts`)
- http://127.0.0.1:8000/docs 에서 API 목록을 보고 직접 호출해 볼 수 있어요.
- 로컬 `unizer.db`는 테스트용이에요. 진짜 데이터는 서버에 있어요.

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
    services/            여러 API가 같이 쓰는 로직 (예: 시간 겹침 검사)
    seed.py              테이블 만들기 + 부원 넣기
    song_import.py       곡 붙여넣기 파싱
  data/members.csv       부원 명단

frontend/
  src/
    App.tsx              상단 탭 목록
    pages/               기능별 화면  ← 기능 하나 = 폴더 하나
    components/          여러 화면이 같이 쓰는 부품 (Toast, 휠 선택기)
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
| **연습 공간** — 주간 캘린더, 보충 등록·수정·삭제, 날짜별 메모 | 연습 공간 | `pages/schedule/` | `routers/reservations.py`<br>`routers/notes.py`<br>`services/conflicts.py` | `reservations`<br>`notes` | jinn-ie |
| **곡** — 곡 목록, 붙여넣기로 곡 등록, 정규연습 시간표 등록 | 곡 | `pages/data/` (`DataPage`, `SongImport`, `TimetableForm`) | `routers/songs.py`<br>`routers/regular_practices.py`<br>`song_import.py` | `songs`<br>`song_members`<br>`regular_practices` | jinn-ie |
| **부원** — 기수별 부원 목록 | 부원 | `pages/data/DataPage.tsx` | `routers/members.py`<br>`seed.py`, `data/members.csv` | `members` | jinn-ie |
| **의견 보내기** | 의견 보내기 | `pages/feedback/` | `routers/feedback.py` | `feedbacks` | jinn-ie |

새 기능을 만들면 이 표에 한 줄 추가해 주세요.

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
5. `python -m app.seed` — 새 테이블을 로컬 DB에 만들어요. (없는 테이블만 만들고 기존 데이터는 그대로예요)
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
| `lib/spaces.ts` ↔ `models.py`의 `Space` | 공간 목록은 두 곳이 같아야 해요. 바꿀 땐 둘 다 |

### ⚠️ 기존 테이블 구조를 바꿀 땐 먼저 상의하기

테이블은 `python -m app.seed`(`create_all`)로 만들어요. 이 방식은 **없는 테이블만 새로 만들고, 이미 있는 테이블에 컬럼을 추가하거나 바꾸지는 못해요.**
그래서 기존 테이블에 컬럼을 추가하면 내 로컬에서는 DB를 지우고 다시 만들어 동작하더라도, 실제 데이터가 있는 서버 DB에는 반영되지 않아요.

- **새 테이블 추가:** 괜찮아요. 배포한 뒤 서버에서 `python -m app.seed`를 한 번 실행하면 돼요.
- **기존 테이블 수정** (컬럼 추가·삭제·이름 변경): 작업 전에 먼저 이야기해 주세요.

---

## 브랜치 · 커밋 규칙

`main`은 **서버에 올라가는 코드**예요. `main`에 직접 커밋하지 않고, 브랜치에서 작업한 뒤 PR로 합쳐요.

### 흐름

```powershell
git switch main
git pull                              # 최신 main 받기
git switch -c feat/events             # 작업 브랜치 만들기

# ... 작업하고 커밋 ...

git push -u origin feat/events        # GitHub에 올리기
```

1. GitHub에서 `feat/events` → `main`으로 **PR(Pull Request)** 을 만들어요.
2. **다른 한 명이 확인**하고 머지해요. (기능 담당자가 아니어도 화면이 잘 뜨는지 정도는 같이 봐요)
3. 머지한 뒤에는 로컬 브랜치를 정리해요: `git switch main` → `git pull` → `git branch -d feat/events`

작업이 길어지면 중간중간 `main`의 최신 내용을 받아오세요.
```powershell
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

---

## 배포

서버(Oracle Cloud) 한 대에 nginx + uvicorn + SQLite로 올라가 있어요. 서버 접속 권한은 jinn-ie에게 있어요.

1. PR이 `main`에 머지되면
2. jinn-ie가 서버에 접속해서 배포 스크립트를 실행해요.
   ```bash
   ~/deploy.sh
   ```
   스크립트가 순서대로 해 주는 일: DB 백업 → `git pull` → `pip install` + 백엔드 재시작 → 프론트 빌드 → nginx 폴더(`/var/www/unizer`)로 복사
3. **새 테이블이 생겼다면** 이어서 한 번 더 실행해요.
   ```bash
   cd ~/Unizer/backend
   venv/bin/python -m app.seed
   ```
   서버 venv 폴더 이름은 점 없이 `venv`예요. 로컬은 `.venv`라서 달라요.

로컬 DB 파일을 서버로 올리면 진짜 데이터가 덮어써지니까 절대 올리지 마세요.
