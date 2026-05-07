"""
存储抽象层 - 方便后续迁移到 S3/OSS
"""
import os
import aiofiles

# 作品文件存储目录
WORKS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "works")
os.makedirs(WORKS_DIR, exist_ok=True)


class LocalStorage:
    """本地文件存储"""

    def __init__(self, base_dir: str = WORKS_DIR):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def _resolve_path(self, work_id: str) -> str:
        return os.path.join(self.base_dir, work_id, "index.html")

    async def save(self, work_id: str, content: str) -> str:
        """保存作品，返回相对路径"""
        work_dir = os.path.join(self.base_dir, work_id)
        os.makedirs(work_dir, exist_ok=True)
        file_path = self._resolve_path(work_id)
        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(content)
        return f"{work_id}/index.html"

    async def get(self, work_id: str) -> str:
        """读取作品内容"""
        file_path = self._resolve_path(work_id)
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Work {work_id} not found")
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            return await f.read()

    async def delete(self, work_id: str) -> bool:
        """删除作品"""
        import shutil
        work_dir = os.path.join(self.base_dir, work_id)
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir)
            return True
        return False

    def get_size(self, work_id: str) -> int:
        """获取文件大小"""
        file_path = self._resolve_path(work_id)
        if os.path.exists(file_path):
            return os.path.getsize(file_path)
        return 0


# 全局存储实例
storage = LocalStorage()
