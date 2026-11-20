from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = "sqlite:///./unizer.db"        # 실행한 위치에 unizer.db 파일이 생김

engine = create_engine(DATABASE_URL, echo=True) # echo=True: 실행되는 SQL을 터미널에 출력
SessionLocal = sessionmaker(bind=engine)        # DB와 대화하는 "세션"을 찍어내는 공장

class Base(DeclarativeBase):                    # 모든 테이블 클래스의 부모
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db        # API 함수에 세션을 빌려줌
    finally:
        db.close()      # 응답이 끝나면 반드시 닫음

# SQLite는 기본적으로 외래 키 검사를 안 함 -> 연결할 때마다 켜기
@event.listens_for(engine, "connect")
def enable_foreign_keys(dbapi_conn, _):
    dbapi_conn.execute("PRAGMA foreign_keys=ON")
