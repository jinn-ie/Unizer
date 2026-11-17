from fastapi import FastAPI

# FastAPI 앱 객체. uvicorn 이 이 객체를 찾아서 실행한다. (app.main:app)
app = FastAPI(title="dance-ud API")


# GET / 요청이 오면 이 함수가 실행되고, 반환한 dict 가 JSON 으로 응답된다.
@app.get("/")
def hello():
    return {"message": "Hello, dance-ud!"}
