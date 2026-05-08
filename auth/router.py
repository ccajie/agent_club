"""
认证 API 路由
"""
import traceback
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .service import auth_service
from .dependencies import get_current_user

router = APIRouter(prefix="/api/auth", tags=["认证"])


class RegisterRequest(BaseModel):
    username: str
    password: str
    nickname: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/register")
async def register(req: RegisterRequest):
    """用户注册"""
    try:
        result = auth_service.register(req.username, req.password, req.nickname)
    except Exception as e:
        print(f"❌ 注册异常: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"注册失败: {str(e)}")
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/login")
async def login(req: LoginRequest):
    """用户登录"""
    try:
        result = auth_service.login(req.username, req.password)
    except Exception as e:
        print(f"❌ 登录异常: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")
    if not result["success"]:
        raise HTTPException(status_code=401, detail=result["message"])
    return result


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """获取当前用户信息"""
    return {"success": True, "user": user}
