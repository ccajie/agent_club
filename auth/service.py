"""
认证服务 - 注册、登录、Token 管理
"""
import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

import jwt
import bcrypt as _bcrypt

from plaza_platform.database import SessionLocal, engine
from .models import User

# 确保 users 表存在（兼容旧数据库升级场景）
User.metadata.create_all(bind=engine)


def _hash_password(password: str) -> str:
    """哈希密码"""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    """验证密码"""
    return _bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))

# JWT 配置
JWT_SECRET = os.environ.get("JWT_SECRET", "agent-club-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 72  # Token 有效期 3 天


class AuthService:
    """认证服务"""

    def register(self, username: str, password: str, nickname: str = "") -> dict:
        """注册新用户"""
        username = username.strip().lower()
        if not username or len(username) < 2:
            return {"success": False, "message": "用户名至少 2 个字符"}
        if len(username) > 50:
            return {"success": False, "message": "用户名不能超过 50 个字符"}
        if not password or len(password) < 4:
            return {"success": False, "message": "密码至少 4 个字符"}

        db = SessionLocal()
        try:
            # 检查用户名是否已存在
            existing = db.query(User).filter(User.username == username).first()
            if existing:
                return {"success": False, "message": "用户名已存在"}

            # 创建用户
            user = User(
                id=str(uuid.uuid4()),
                username=username,
                password_hash=_hash_password(password),
                nickname=nickname.strip() or username,
            )
            db.add(user)
            db.commit()

            # 初始化用户数据目录
            try:
                from .user_data import get_user_data
                user_data = get_user_data(user.id)
                user_data.init_default_data()
            except Exception as e:
                print(f"⚠️ 初始化用户数据目录失败（不影响注册）: {e}")

            # 生成 token
            token = self._create_token(user.id, user.username)

            return {
                "success": True,
                "message": "注册成功",
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "nickname": user.nickname,
                },
            }
        finally:
            db.close()

    def login(self, username: str, password: str) -> dict:
        """登录"""
        username = username.strip().lower()

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user:
                return {"success": False, "message": "用户名或密码错误"}

            if not _verify_password(password, user.password_hash):
                return {"success": False, "message": "用户名或密码错误"}

            token = self._create_token(user.id, user.username)

            return {
                "success": True,
                "message": "登录成功",
                "token": token,
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "nickname": user.nickname,
                },
            }
        finally:
            db.close()

    def verify_token(self, token: str) -> Optional[dict]:
        """验证 token，返回用户信息或 None"""
        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            return {
                "id": payload["user_id"],
                "username": payload["username"],
            }
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return None

    def get_user_by_id(self, user_id: str) -> Optional[dict]:
        """根据 ID 获取用户信息"""
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return None
            return {
                "id": user.id,
                "username": user.username,
                "nickname": user.nickname,
            }
        finally:
            db.close()

    def _create_token(self, user_id: str, username: str) -> str:
        """生成 JWT token"""
        payload = {
            "user_id": user_id,
            "username": username,
            "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
            "iat": datetime.utcnow(),
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# 全局单例
auth_service = AuthService()
