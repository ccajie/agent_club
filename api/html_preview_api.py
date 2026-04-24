"""
HTML Preview API - Manage and preview AI-generated HTML files
Supports subdirectories within output/preview/
"""
import os
import time
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

router = APIRouter()

# Preview files directory
PREVIEW_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "output", "preview"
)


def _ensure_dir():
    """Ensure preview directory exists"""
    os.makedirs(PREVIEW_DIR, exist_ok=True)


def _sanitize_path(filepath: str) -> str:
    """Sanitize file path to prevent directory traversal.
    Allows subdirectories within PREVIEW_DIR.
    """
    # Normalize path and remove leading slashes
    filepath = filepath.strip("/\\")
    # Split into parts
    parts = filepath.replace("\\", "/").split("/")
    # Sanitize each part
    sanitized_parts = []
    for part in parts:
        # Remove potentially dangerous characters but keep dots for extensions
        part = "".join(c for c in part if c.isalnum() or c in "._-")
        if part and part not in (".", ".."):
            sanitized_parts.append(part)

    if not sanitized_parts:
        return f"preview_{int(time.time())}.html"

    result = "/".join(sanitized_parts)
    # Ensure it ends with .html
    if not result.endswith(".html"):
        result += ".html"
    return result


def _resolve_path(filepath: str) -> str:
    """Resolve a path within PREVIEW_DIR, ensuring it doesn't escape."""
    safe = _sanitize_path(filepath)
    full = os.path.normpath(os.path.join(PREVIEW_DIR, safe))
    # Security check: ensure resolved path is within PREVIEW_DIR
    if not full.startswith(os.path.normpath(PREVIEW_DIR)):
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
async def list_html_files():
    """List all HTML preview files (recursively scans subdirectories)"""
    _ensure_dir()
    files = []

    for root, _dirs, filenames in os.walk(PREVIEW_DIR):
        for name in filenames:
            if not name.endswith(".html"):
                continue
            filepath = os.path.join(root, name)
            if not os.path.isfile(filepath):
                continue
            # Compute relative path from PREVIEW_DIR
            rel_path = os.path.relpath(filepath, PREVIEW_DIR)
            # Use forward slashes for consistency
            rel_path = rel_path.replace("\\", "/")
            stat = os.stat(filepath)
            files.append(HtmlFileInfo(
                filename=rel_path,
                size=stat.st_size,
                created_at=stat.st_ctime,
                updated_at=stat.st_mtime,
            ))

    # Sort by updated time descending
    files.sort(key=lambda f: f.updated_at, reverse=True)
    return HtmlFileListResponse(files=files)


@router.post("/api/html-preview", response_model=SaveHtmlResponse)
async def save_html_file(request: SaveHtmlRequest):
    """Save an HTML file to the preview directory (supports subdirectories)"""
    _ensure_dir()
    filename = _sanitize_path(request.filename)
    filepath = _resolve_path(filename)

    # Ensure parent directories exist
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
async def get_html_content(filepath: str):
    """Get the raw content of an HTML file (supports subdirectories)"""
    _ensure_dir()
    full_path = _resolve_path(filepath)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"success": True, "filename": filepath, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")


@router.delete("/api/html-preview/{filepath:path}")
async def delete_html_file(filepath: str):
    """Delete an HTML preview file (supports subdirectories)"""
    _ensure_dir()
    full_path = _resolve_path(filepath)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        os.remove(full_path)
        # Clean up empty parent directories
        parent = os.path.dirname(full_path)
        while parent != PREVIEW_DIR and os.path.isdir(parent):
            try:
                os.rmdir(parent)
                parent = os.path.dirname(parent)
            except OSError:
                break
        return {"success": True, "message": f"Deleted: {filepath}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")


@router.get("/preview/{filepath:path}", response_class=HTMLResponse)
async def preview_html(filepath: str):
    """Serve an HTML file for preview (used by iframe, supports subdirectories)"""
    _ensure_dir()
    full_path = _resolve_path(filepath)

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")
