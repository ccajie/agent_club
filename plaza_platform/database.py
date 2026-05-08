"""
平台数据库 - SQLite + SQLAlchemy
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 数据库文件路径
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "platform.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """获取数据库 session（用于 FastAPI Depends）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """初始化数据库表"""
    Base.metadata.create_all(bind=engine)
    _migrate_add_author_id()


def _migrate_add_author_id():
    """迁移：为 works 表添加 author_id 列（兼容旧数据库）"""
    import sqlite3
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute("PRAGMA table_info(works)")
        columns = [row[1] for row in cursor.fetchall()]
        if "author_id" not in columns:
            conn.execute("ALTER TABLE works ADD COLUMN author_id VARCHAR(36) DEFAULT ''")
            conn.commit()
            print("✅ 数据库迁移：works 表已添加 author_id 列")
    except Exception as e:
        print(f"⚠️ 数据库迁移检查: {e}")
    finally:
        conn.close()
