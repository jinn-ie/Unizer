from fastapi import FastAPI

from app.routers import feedback, members, notes, regular_practices, reservations, songs

# FastAPI 앱 객체. uvicorn 이 이 객체를 찾아서 실행한다. (app.main:app)
app = FastAPI(title="Unizer API")

# 기능별 API 묶음(routers/*.py)을 앱에 붙임
app.include_router(reservations.router)        # 보충
app.include_router(regular_practices.router)   # 정규연습
app.include_router(songs.router)               # 곡
app.include_router(members.router)             # 부원
app.include_router(notes.router)               # 날짜별 메모
app.include_router(feedback.router)            # 의견 보내기


# GET / 요청이 오면 이 함수가 실행되고, 반환한 dict 가 JSON 으로 응답된다.
@app.get("/")
def hello():
    return {"message": "춤춰라 유디!"}
