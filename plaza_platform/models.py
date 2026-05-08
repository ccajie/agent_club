"""
平台数据模型
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Text, Integer, DateTime
from .database import Base


class Work(Base):
    """发布的作品"""
    __tablename__ = "works"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    author = Column(String(100), default="匿名用户")  # 显示名称
    author_id = Column(String(36), default="")  # 关联用户 ID
    tags = Column(String(500), default="")  # 逗号分隔的标签
    file_path = Column(String(500), nullable=False)  # 相对于 works/ 目录
    file_size = Column(Integer, default=0)
    view_count = Column(Integer, default=0)
    status = Column(String(20), default="published")  # published / unlisted
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
