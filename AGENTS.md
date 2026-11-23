# AGENTS.md

이 저장소에서 일하는 AI 코딩 에이전트를 위한 안내예요. 사람용 설명(실행 방법, 폴더 구조, 기능 지도, 배포)은 [README.md](README.md)에 있으니 먼저 읽어 주세요.

## 프로젝트 한 줄 요약

댄스 동아리(UCDC)의 연습 공간 · 연습 일정 관리 모바일 웹앱이에요.
백엔드는 FastAPI + SQLAlchemy 2 + SQLite(`backend/`), 프론트는 React + TypeScript + Vite(`frontend/`)예요.
화면은 모바일 기준(최대 폭 480px)이고, 다크 테마 하나만 있어요.

## 꼭 지킬 것

- **사용자에게는 한국어로** 답해요. 코드 주석과 화면 문구도 한국어(존댓말 "~해요" 체)예요.
- **코드는 쉽게.** 프로젝트 주인이 백엔드를 배우면서 만들고 있어요. 영리한 한 줄보다 읽기 쉬운 코드, 주석으로 "왜"를 남기는 스타일을 따라 주세요. 기존 파일의 주석 스타일을 보고 맞추면 돼요.
- **DB 구조 변경은 조심.** 테이블은 `python -m app.seed`(`create_all`)로 만들어서, **기존 테이블의 컬럼 추가 · 삭제는 서버에 자동 반영되지 않아요.** 기존 테이블을 바꾸는 작업이면
  1. 사용자에게 먼저 확인하고,
  2. 로컬 DB에 실행할 SQL을 알려 주고,
  3. README의 "서버 DB 변경 기록" 표에 한 줄 추가해 주세요.
- **서버 DB · 배포는 건드리지 않아요.** 서버 접속과 `deploy.sh` 실행은 사람이 해요.
- **로컬 DB(`backend/unizer.db`)를 바꾸기 전에는 백업**(`*.bak`, git 제외됨)하고, 테스트는 되도록 DB 복사본에서 해요.
- **공간 목록과 순서**는 `backend/app/models.py`의 `Space`와 `frontend/src/lib/spaces.ts`가 같아야 해요. (동방 → 바깥거울 → 대회의실1 → 대회의실2)

## 작업 확인 방법

테스트 코드는 아직 없어요. 바꾼 뒤에는 최소한 아래를 돌려 주세요. (Windows cmd 기준)

```bat
rem 백엔드: import 오류 확인 (backend 폴더)
.venv\Scripts\python -c "import app.main"

rem 프론트: 타입 검사 + 빌드, 코드 검사 (frontend 폴더)
npm run build
npm run lint
```

API는 백엔드를 켜고 http://127.0.0.1:8000/docs 에서 직접 호출해 볼 수 있어요.
화면 동작(특히 꾹 눌러 끌기 같은 터치 동작)은 빌드만으로는 확인이 안 되니, 확인하지 못했으면 그렇다고 말해 주세요.

## 코드 위치 빠르게 찾기

| 하려는 일 | 볼 곳 |
|---|---|
| 테이블 / API 입출력 형식 | `backend/app/models.py`, `backend/app/schemas.py` |
| API 추가 · 수정 | `backend/app/routers/<기능>.py` (+ `main.py`에 등록) |
| 겹침 검사, 시간표 → 연습 만들기 | `backend/app/services/` |
| 백엔드 호출 함수 · 타입 | `frontend/src/api.ts`, `frontend/src/types.ts` |
| 화면 | `frontend/src/pages/<기능>/` (컴포넌트와 같은 이름의 `.css`) |
| 색상 · 글꼴 · 공통 레이아웃 | `frontend/src/index.css` (색은 `:root`의 토큰으로) |

연습 1건 = `reservations` 1행이고, 시간표(`timetables` / `timetable_slots`)로 만든 연습은 `slot_id`로 블록과 연결돼요. 자세한 관계는 README의 "연습과 시간표의 관계"를 봐 주세요.

## Git

- 커밋 메시지: `종류(범위): 무엇을 했는지` (한국어). 종류는 `feat` · `fix` · `refactor` · `chore`, 범위는 `backend` · `frontend`.
- **커밋은 수정 단위로 나눠요.** 여러 작업을 backend / frontend 두 덩어리로 뭉치지 말고, 변경 하나마다 커밋해요.
- `main`에 직접 커밋하지 말고 브랜치(`feat/…`, `fix/…`)에서 작업해요. 커밋 · 푸시 · 머지는 사용자가 요청할 때만 해요.
- `*.db`, `*.bak`, `.env`, `dist/`, `node_modules/`는 커밋하지 않아요. (`.gitignore`에 있음)
