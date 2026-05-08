"""
用户数据模型
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime
from plaza_platform.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(50), unique=True, nullable=False, index=True)
    password_hash = Column(String(128), nullable=False)
    nickname = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.utcnow)
