"""
FastAPI 依赖 - 用于路由中获取当前用户
"""
from typing import Optional
from fastapi import Request, HTTPException

from .service import auth_service


def _extract_token(request: Request) -> Optional[str]:
    """从请求头提取 token"""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def get_current_user(request: Request) -> dict:
    """
    获取当前登录用户（必须登录）
    用法: user = Depends(get_current_user)
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="未登录")

    user = auth_service.verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")

    return user


async def get_optional_user(request: Request) -> Optional[dict]:
    """
    获取当前用户（可选，未登录返回 None）
    用法: user = Depends(get_optional_user)
    """
    token = _extract_token(request)
    if not token:
        return None

    return auth_service.verify_token(token)
