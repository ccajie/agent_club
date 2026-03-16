"""
Data loading and management - 已禁用
"""

# 所有 RAG 功能已注释掉

'''
"""
Data loading and management utilities for the RAG knowledge base.
Core file management system with MD5-based duplicate detection.
"""
import os
import shutil
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
import hashlib


def get_reader_for_file(file_path: str):
    """Import and return appropriate reader for the given file type."""
    try:
        from ..utils.document_readers import get_reader_for_file as _get_reader
    except ImportError:
        from utils.document_readers import get_reader_for_file as _get_reader
    return _get_reader(file_path)


class DataLoader:
    """
    Core file management system for the RAG knowledge base.
    Handles file validation, organization, preprocessing, and duplicate detection using MD5.
    """

    SUPPORTED_EXTENSIONS = {'.txt', '.docx', '.pdf', '.xlsx', '.xls'}
    METADATA_FILE = "file_metadata.json"
    PROCESSED_DOCS_DIR = "processed_documents"

    def __init__(self, data_dir: str) -> None:
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(exist_ok=True, parents=True)

        self.original_files_dir = self.data_dir / "original_files"
        self.processed_docs_dir = self.data_dir / self.PROCESSED_DOCS_DIR
        self.logs_dir = self.data_dir / "logs"

        self._create_directory_structure()

        self.metadata_file = self.data_dir / self.METADATA_FILE
        self.file_metadata = self._load_metadata()

        self.processed_docs_dir.mkdir(exist_ok=True)

    def _create_directory_structure(self) -> None:
        self.original_files_dir.mkdir(exist_ok=True)
        self.processed_docs_dir.mkdir(exist_ok=True)
        self.logs_dir.mkdir(exist_ok=True)

        for ext in self.SUPPORTED_EXTENSIONS:
            subdir = self.original_files_dir / ext[1:]
            subdir.mkdir(exist_ok=True, parents=True)

    def load_file(self, file_path: str, move_file: bool = False) -> Tuple[bool, Optional[str]]:
        src_path = Path(file_path)

        if not src_path.exists():
            print(f"Error: File does not exist: {file_path}")
            return False, None

        if src_path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            print(f"Error: Unsupported file type: {src_path.suffix}")
            return False, None

        file_md5 = self._calculate_md5(str(src_path))

        if file_md5 in self.file_metadata:
            existing_entry = self.file_metadata[file_md5]
            print(f"Duplicate detected! File already exists as: {existing_entry['stored_name']}")
            return True, existing_entry['processed_path']

        try:
            dest_dir = self.original_files_dir / src_path.suffix[1:]
            stored_name = f"{file_md5}{src_path.suffix}"
            original_dest_path = dest_dir / stored_name

            if move_file:
                shutil.move(str(src_path), str(original_dest_path))
            else:
                shutil.copy2(str(src_path), str(original_dest_path))

            processed_path = self._preprocess_document(str(original_dest_path), file_md5)

            self._update_metadata(
                file_md5=file_md5,
                original_path=str(src_path.absolute()),
                stored_name=stored_name,
                processed_path=processed_path,
                file_size=src_path.stat().st_size,
                file_extension=src_path.suffix.lower()
            )

            print(f"Successfully loaded and processed: {src_path.name}")
            return True, processed_path

        except Exception as e:
            print(f"Error processing file {file_path}: {str(e)}")
            return False, None

    def load_directory(self, dir_path: str, recursive: bool = True, move_files: bool = False) -> Dict[str, Any]:
        dir_path = Path(dir_path)
        if not dir_path.exists() or not dir_path.is_dir():
            print(f"Error: Directory does not exist: {dir_path}")
            return {"success": False, "loaded": 0, "duplicates": 0, "errors": []}

        if recursive:
            pattern = "**/*"
        else:
            pattern = "*"

        files_found = [
            f for f in dir_path.glob(pattern)
            if f.is_file() and f.suffix.lower() in self.SUPPORTED_EXTENSIONS
        ]

        stats = {
            "total_found": len(files_found),
            "successfully_loaded": 0,
            "duplicates_skipped": 0,
            "processing_errors": [],
            "loaded_files": [],
            "duplicate_files": []
        }

        print(f"Found {len(files_found)} supported files in {dir_path}")

        for file_path in files_found:
            print(f"Processing: {file_path.name}")
            success, processed_path = self.load_file(str(file_path), move_file=move_files)

            if success and processed_path:
                stats["successfully_loaded"] += 1
                stats["loaded_files"].append({
                    "original": str(file_path),
                    "processed": processed_path
                })
            elif success and not processed_path:
                stats["duplicates_skipped"] += 1
                stats["duplicate_files"].append(str(file_path))
            else:
                stats["processing_errors"].append(str(file_path))

        print(f"\nDirectory loading complete:")
        print(f"  - Successfully loaded: {stats['successfully_loaded']} files")
        print(f"  - Duplicates skipped: {stats['duplicates_skipped']} files")
        print(f"  - Errors: {len(stats['processing_errors'])} files")

        return stats

    def _calculate_md5(self, file_path: str) -> str:
        md5_hash = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                md5_hash.update(chunk)
        return md5_hash.hexdigest()

    def _preprocess_document(self, file_path: str, file_md5: str) -> str:
        try:
            print(f"  📖 正在获取文档阅读工具")
            reader = get_reader_for_file(file_path)
            print(f"  📖 正在读取文档...")
            documents = reader.read(file_path)
            print(f"  ✓ 文档读取完成，共 {len(documents)} 个文本块")

            processed_file_path = self.processed_docs_dir / f"{file_md5}.json"
            processed_data = {
                "file_md5": file_md5,
                "original_path": file_path,
                "documents": documents,
                "document_count": len(documents)
            }

            print(f"  💾 正在保存处理后的文档...")
            with open(processed_file_path, 'w', encoding='utf-8') as f:
                json.dump(processed_data, f, ensure_ascii=False, indent=2)
            print(f"  ✓ 处理完成")

            return str(processed_file_path)

        except Exception as e:
            print(f"  ✗ 处理失败: {str(e)}")
            raise Exception(f"Failed to preprocess document: {str(e)}")

    def _load_metadata(self) -> Dict[str, Any]:
        if self.metadata_file.exists():
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Warning: Could not load metadata file: {e}")
                return {}
        return {}

    def _update_metadata(self, file_md5: str, original_path: str, stored_name: str,
                        processed_path: str, file_size: int, file_extension: str) -> None:
        import datetime

        self.file_metadata[file_md5] = {
            "original_path": original_path,
            "stored_name": stored_name,
            "processed_path": processed_path,
            "file_size": file_size,
            "file_extension": file_extension,
            "added_timestamp": datetime.datetime.now().isoformat(),
            "md5_hash": file_md5
        }

        self._save_metadata()

    def _save_metadata(self) -> None:
        try:
            with open(self.metadata_file, 'w', encoding='utf-8') as f:
                json.dump(self.file_metadata, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Warning: Could not save metadata: {e}")

    def delete_by_md5(self, file_md5: str) -> None:
        if file_md5 not in self.file_metadata:
            raise KeyError(f"No metadata entry for MD5 {file_md5}")

        entry = self.file_metadata[file_md5]
        processed_path = entry.get("processed_path")
        stored_name = entry.get("stored_name")
        file_extension = entry.get("file_extension")

        try:
            if processed_path and os.path.exists(processed_path):
                os.remove(processed_path)
        except Exception as e:
            print(f"Warning: failed to remove processed file {processed_path}: {e}")

        try:
            if stored_name and file_extension:
                stored_path = self.original_files_dir / file_extension.lstrip('.') / stored_name
                if stored_path.exists():
                    os.remove(stored_path)
        except Exception as e:
            print(f"Warning: failed to remove original stored file {stored_name}: {e}")

        self.file_metadata.pop(file_md5, None)
        self._save_metadata()



    def get_statistics(self) -> Dict[str, Any]:
        if not self.file_metadata:
            return {"total_files": 0, "by_extension": {}}

        stats = {
            "total_files": len(self.file_metadata),
            "by_extension": {},
            "total_size": sum(entry["file_size"] for entry in self.file_metadata.values())
        }

        for entry in self.file_metadata.values():
            ext = entry["file_extension"]
            stats["by_extension"][ext] = stats["by_extension"].get(ext, 0) + 1

        return stats
'''


# 提供空的占位类，防止导入错误
class DataLoader:
    """DataLoader - 已禁用"""
    def __init__(self, *args, **kwargs):
        raise RuntimeError("DataLoader 功能已禁用 (RAG 功能已禁用)")
