from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = "sqlite:///./dance_ud.db"        # 실행한 위치에 dance_ud.db 파일이 생김

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
