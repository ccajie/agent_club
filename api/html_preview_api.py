"""
HTML Preview API - Manage and preview AI-generated HTML files
Per-user isolated preview directories
"""
import os
import time
from typing import List

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from auth.dependencies import get_current_user
from auth.user_data import get_user_data

router = APIRouter()


def _get_user_preview_dir(user_id: str) -> str:
    """获取用户专属的预览目录"""
    user_data = get_user_data(user_id)
    os.makedirs(user_data.preview_dir, exist_ok=True)
    return user_data.preview_dir


def _sanitize_path(filepath: str) -> str:
    """Sanitize file path to prevent directory traversal."""
    filepath = filepath.strip("/\\")
    parts = filepath.replace("\\", "/").split("/")
    sanitized_parts = []
    for part in parts:
        part = "".join(c for c in part if c.isalnum() or c in "._-")
        if part and part not in (".", ".."):
            sanitized_parts.append(part)

    if not sanitized_parts:
        return f"preview_{int(time.time())}.html"

    result = "/".join(sanitized_parts)
    if not result.endswith(".html"):
        result += ".html"
    return result


def _resolve_path(filepath: str, preview_dir: str) -> str:
    """Resolve a path within preview_dir, ensuring it doesn't escape."""
    safe = _sanitize_path(filepath)
    full = os.path.normpath(os.path.join(preview_dir, safe))
    if not full.startswith(os.path.normpath(preview_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return full


class SaveHtmlRequest(BaseModel):
    filename: str
    content: str


class HtmlFileInfo(BaseModel):
    filename: str
    size: int
    created_at: float
    updated_at: float


class HtmlFileListResponse(BaseModel):
    files: List[HtmlFileInfo]


class SaveHtmlResponse(BaseModel):
    success: bool
    filename: str
    message: str


@router.get("/api/html-preview", response_model=HtmlFileListResponse)
async def list_html_files(user: dict = Depends(get_current_user)):
    """List all HTML preview files for current user"""
    preview_dir = _get_user_preview_dir(user["id"])
    files = []

    for root, _dirs, filenames in os.walk(preview_dir):
        for name in filenames:
            if not name.endswith(".html"):
                continue
            filepath = os.path.join(root, name)
            if not os.path.isfile(filepath):
                continue
            rel_path = os.path.relpath(filepath, preview_dir)
            rel_path = rel_path.replace("\\", "/")
            stat = os.stat(filepath)
            files.append(HtmlFileInfo(
                filename=rel_path,
                size=stat.st_size,
                created_at=stat.st_ctime,
                updated_at=stat.st_mtime,
            ))

    files.sort(key=lambda f: f.updated_at, reverse=True)
    return HtmlFileListResponse(files=files)


@router.post("/api/html-preview", response_model=SaveHtmlResponse)
async def save_html_file(request: SaveHtmlRequest, user: dict = Depends(get_current_user)):
    """Save an HTML file to user's preview directory"""
    preview_dir = _get_user_preview_dir(user["id"])
    filename = _sanitize_path(request.filename)
    filepath = _resolve_path(filename, preview_dir)

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(request.content)
        return SaveHtmlResponse(
            success=True,
            filename=filename,
            message=f"File saved: {filename}",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")


@router.get("/api/html-preview/{filepath:path}/content")
async def get_html_content(filepath: str, user: dict = Depends(get_current_user)):
    """Get the raw content of an HTML file"""
    preview_dir = _get_user_preview_dir(user["id"])
    full_path = _resolve_path(filepath, preview_dir)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"success": True, "filename": filepath, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")


@router.delete("/api/html-preview/{filepath:path}")
async def delete_html_file(filepath: str, user: dict = Depends(get_current_user)):
    """Delete an HTML preview file"""
    preview_dir = _get_user_preview_dir(user["id"])
    full_path = _resolve_path(filepath, preview_dir)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        os.remove(full_path)
        parent = os.path.dirname(full_path)
        while parent != preview_dir and os.path.isdir(parent):
            try:
                os.rmdir(parent)
                parent = os.path.dirname(parent)
            except OSError:
                break
        return {"success": True, "message": f"Deleted: {filepath}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")


@router.get("/preview/{filepath:path}", response_class=HTMLResponse)
async def preview_html(filepath: str, user: dict = Depends(get_current_user)):
    """Serve an HTML file for preview (used by iframe)"""
    preview_dir = _get_user_preview_dir(user["id"])
    full_path = _resolve_path(filepath, preview_dir)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")
