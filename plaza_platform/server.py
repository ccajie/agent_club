"""
平台 API 服务 - 作品发布与广场
挂载到主应用的 /platform 路径下
"""
import os
import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from .database import init_db, SessionLocal
from .models import Work
from .storage import storage

# 初始化数据库
init_db()

# 创建平台子应用
platform_app = FastAPI(title="Agent Club Platform", version="0.1.0")

# output/preview 目录（读取本地预览文件用于发布）
PREVIEW_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "output", "preview"
)


# ============== 请求/响应模型 ==============

class PublishRequest(BaseModel):
    title: str
    description: str = ""
    author: str = "匿名用户"
    tags: str = ""  # 逗号分隔
    source_file: Optional[str] = None  # output/preview/ 下的文件名
    content: Optional[str] = None  # 或者直接传 HTML 内容


class PublishResponse(BaseModel):
    success: bool
    work_id: str
    title: str
    message: str


class WorkInfo(BaseModel):
    id: str
    title: str
    description: str
    author: str
    tags: str
    file_size: int
    view_count: int
    status: str
    created_at: str
    updated_at: str


class WorkListResponse(BaseModel):
    works: List[WorkInfo]
    total: int
    page: int
    page_size: int


# ============== API 路由 ==============

@platform_app.get("/api/health")
async def platform_health():
    """平台健康检查"""
    return {"status": "healthy", "service": "platform"}


@platform_app.post("/api/publish", response_model=PublishResponse)
async def publish_work(req: PublishRequest):
    """发布作品到平台"""
    # 获取 HTML 内容
    html_content = req.content
    if not html_content:
        if not req.source_file:
            raise HTTPException(status_code=400, detail="必须提供 source_file 或 content")
        # 从本地 preview 目录读取
        source_path = os.path.join(PREVIEW_DIR, req.source_file)
        if not os.path.exists(source_path):
            raise HTTPException(status_code=404, detail=f"源文件不存在: {req.source_file}")
        with open(source_path, "r", encoding="utf-8") as f:
            html_content = f.read()

    if not html_content.strip():
        raise HTTPException(status_code=400, detail="HTML 内容不能为空")

    # 限制文件大小 (2MB)
    if len(html_content.encode("utf-8")) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小超过 2MB 限制")

    # 生成 work_id 并存储
    work_id = str(uuid.uuid4())
    relative_path = await storage.save(work_id, html_content)
    file_size = storage.get_size(work_id)

    # 写入数据库
    title = req.title.strip() or "未命名作品"
    db = SessionLocal()
    try:
        work = Work(
            id=work_id,
            title=title,
            description=req.description.strip(),
            author=req.author.strip() or "匿名用户",
            tags=req.tags.strip(),
            file_path=relative_path,
            file_size=file_size,
            status="published",
        )
        db.add(work)
        db.commit()
    finally:
        db.close()

    return PublishResponse(
        success=True,
        work_id=work_id,
        title=title,
        message="发布成功"
    )


@platform_app.get("/api/works", response_model=WorkListResponse)
async def list_works(
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    sort: str = Query("latest", pattern="^(latest|popular)$"),
    tag: Optional[str] = None,
    search: Optional[str] = None,
):
    """获取广场作品列表"""
    db = SessionLocal()
    try:
        query = db.query(Work).filter(Work.status == "published")

        # 标签筛选
        if tag:
            query = query.filter(Work.tags.contains(tag))

        # 搜索
        if search:
            query = query.filter(
                (Work.title.contains(search)) | (Work.description.contains(search))
            )

        # 排序
        if sort == "popular":
            query = query.order_by(Work.view_count.desc())
        else:
            query = query.order_by(Work.created_at.desc())

        total = query.count()
        works = query.offset((page - 1) * page_size).limit(page_size).all()

        return WorkListResponse(
            works=[
                WorkInfo(
                    id=w.id,
                    title=w.title,
                    description=w.description,
                    author=w.author,
                    tags=w.tags,
                    file_size=w.file_size,
                    view_count=w.view_count,
                    status=w.status,
                    created_at=w.created_at.isoformat() if w.created_at else "",
                    updated_at=w.updated_at.isoformat() if w.updated_at else "",
                )
                for w in works
            ],
            total=total,
            page=page,
            page_size=page_size,
        )
    finally:
        db.close()


@platform_app.get("/api/works/{work_id}")
async def get_work(work_id: str):
    """获取单个作品详情"""
    db = SessionLocal()
    try:
        work = db.query(Work).filter(Work.id == work_id).first()
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")

        return WorkInfo(
            id=work.id,
            title=work.title,
            description=work.description,
            author=work.author,
            tags=work.tags,
            file_size=work.file_size,
            view_count=work.view_count,
            status=work.status,
            created_at=work.created_at.isoformat() if work.created_at else "",
            updated_at=work.updated_at.isoformat() if work.updated_at else "",
        )
    finally:
        db.close()


@platform_app.get("/api/works/{work_id}/render")
async def render_work(work_id: str):
    """渲染作品 HTML（供 iframe 加载）"""
    db = SessionLocal()
    try:
        work = db.query(Work).filter(Work.id == work_id).first()
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")

        # 增加浏览量
        work.view_count = (work.view_count or 0) + 1
        db.commit()
    finally:
        db.close()

    # 读取 HTML 文件
    try:
        content = await storage.get(work_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="作品文件丢失")

    return HTMLResponse(content=content)


@platform_app.delete("/api/works/{work_id}")
async def delete_work(work_id: str):
    """删除作品"""
    db = SessionLocal()
    try:
        work = db.query(Work).filter(Work.id == work_id).first()
        if not work:
            raise HTTPException(status_code=404, detail="作品不存在")

        db.delete(work)
        db.commit()
    finally:
        db.close()

    # 删除文件
    await storage.delete(work_id)

    return {"success": True, "message": "已删除"}
