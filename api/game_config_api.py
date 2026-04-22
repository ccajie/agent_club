"""
游戏配置 API - 管理 game-config.json
"""
import json
import os
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/game-config", tags=["game-config"])

# game-config.json 文件路径（相对于项目根目录）
GAME_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "rpg-frontend", "public", "assets", "game-config.json"
)


def _load_config() -> Dict[str, Any]:
    """加载游戏配置"""
    if not os.path.exists(GAME_CONFIG_PATH):
        raise HTTPException(status_code=404, detail="Game config file not found")
    with open(GAME_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_config(config: Dict[str, Any]) -> None:
    """保存游戏配置"""
    os.makedirs(os.path.dirname(GAME_CONFIG_PATH), exist_ok=True)
    with open(GAME_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


class UpdateCurrentSceneRequest(BaseModel):
    currentScene: str


@router.get("")
async def get_game_config() -> Dict[str, Any]:
    """获取当前游戏配置"""
    return _load_config()


@router.put("")
async def update_game_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """更新游戏配置（全量替换）"""
    _save_config(config)
    return config


@router.put("/current-scene")
async def update_current_scene(data: UpdateCurrentSceneRequest) -> Dict[str, Any]:
    """更新当前场景"""
    config = _load_config()
    if data.currentScene not in config.get("scenes", {}):
        raise HTTPException(status_code=400, detail=f"Scene '{data.currentScene}' not found in config")
    config["currentScene"] = data.currentScene
    _save_config(config)
    return config
