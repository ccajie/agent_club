"""
游戏配置 API - 公共 tilemap + 用户场景隔离
公共资源（tilemap、characters、ui）从 rpg-frontend/public/assets/game-config.json 读取
用户数据（currentScene、scene descriptions）从用户目录读取/写入
"""
import json
import os
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from auth.dependencies import get_current_user
from auth.user_data import get_user_data

router = APIRouter(prefix="/api/game-config", tags=["game-config"])

# 公共 game-config.json（只读，提供 tilemap 等资源定义）
BASE_CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "rpg-frontend", "public", "assets", "game-config.json"
)


def _load_base_config() -> Dict[str, Any]:
    """加载公共基础配置（tilemap、characters、ui）"""
    if not os.path.exists(BASE_CONFIG_PATH):
        raise HTTPException(status_code=404, detail="Base game config not found")
    with open(BASE_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_user_game_config(user_id: str) -> Dict[str, Any]:
    """加载用户的游戏配置（currentScene + scene descriptions）"""
    user_data = get_user_data(user_id)
    config_file = user_data.game_config_file
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    # 如果用户配置不存在，从公共配置初始化
    user_data._init_game_config()
    if os.path.exists(config_file):
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"currentScene": "", "scenes": {}}


def _save_user_game_config(user_id: str, user_config: Dict[str, Any]) -> None:
    """保存用户的游戏配置"""
    user_data = get_user_data(user_id)
    os.makedirs(os.path.dirname(user_data.game_config_file), exist_ok=True)
    with open(user_data.game_config_file, 'w', encoding='utf-8') as f:
        json.dump(user_config, f, ensure_ascii=False, indent=2)


def _merge_config(base: Dict[str, Any], user_config: Dict[str, Any]) -> Dict[str, Any]:
    """合并公共配置 + 用户配置，返回完整 GameConfig"""
    merged = {
        "currentScene": user_config.get("currentScene") or base.get("currentScene", ""),
        "maxAgents": base.get("maxAgents", 10),
        "scenes": {},
        "characters": base.get("characters", {}),
        "ui": base.get("ui", {}),
    }

    # 合并场景：以公共配置的场景为基础，覆盖用户的 description
    user_scenes = user_config.get("scenes", {})
    for key, scene in base.get("scenes", {}).items():
        merged_scene = dict(scene)
        if key in user_scenes:
            # 用户自定义的 description 覆盖公共的
            user_scene = user_scenes[key]
            if "description" in user_scene:
                merged_scene["description"] = user_scene["description"]
        merged["scenes"][key] = merged_scene

    return merged


class UpdateCurrentSceneRequest(BaseModel):
    currentScene: str


class UpdateSceneDescriptionRequest(BaseModel):
    description: str


@router.get("")
async def get_game_config(user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """获取合并后的游戏配置（公共资源 + 用户选择/描述）"""
    base = _load_base_config()
    user_config = _load_user_game_config(user["id"])
    return _merge_config(base, user_config)


@router.put("")
async def update_game_config(config: Dict[str, Any], user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """更新用户游戏配置（仅保存用户可自定义的部分）"""
    # 从提交的完整配置中提取用户部分
    user_config = {
        "currentScene": config.get("currentScene", ""),
        "scenes": {}
    }
    for key, scene in config.get("scenes", {}).items():
        user_config["scenes"][key] = {
            "description": scene.get("description", "")
        }

    _save_user_game_config(user["id"], user_config)

    # 返回合并后的完整配置
    base = _load_base_config()
    return _merge_config(base, user_config)


@router.put("/current-scene")
async def update_current_scene(data: UpdateCurrentSceneRequest, user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """切换当前场景"""
    base = _load_base_config()
    if data.currentScene not in base.get("scenes", {}):
        raise HTTPException(status_code=400, detail=f"Scene '{data.currentScene}' not found")

    user_config = _load_user_game_config(user["id"])
    user_config["currentScene"] = data.currentScene
    _save_user_game_config(user["id"], user_config)

    return _merge_config(base, user_config)


@router.put("/scenes/{scene_key}/description")
async def update_scene_description(
    scene_key: str,
    data: UpdateSceneDescriptionRequest,
    user: dict = Depends(get_current_user)
) -> Dict[str, Any]:
    """更新指定场景的描述"""
    base = _load_base_config()
    if scene_key not in base.get("scenes", {}):
        raise HTTPException(status_code=400, detail=f"Scene '{scene_key}' not found")

    user_config = _load_user_game_config(user["id"])
    if "scenes" not in user_config:
        user_config["scenes"] = {}
    if scene_key not in user_config["scenes"]:
        user_config["scenes"][scene_key] = {}
    user_config["scenes"][scene_key]["description"] = data.description.strip()
    _save_user_game_config(user["id"], user_config)

    return _merge_config(base, user_config)


@router.get("/available-scenes")
async def get_available_scenes(user: dict = Depends(get_current_user)):
    """获取所有可用的公共场景列表（仅返回 tilemap 信息，不含用户数据）"""
    base = _load_base_config()
    scenes = []
    for key, scene in base.get("scenes", {}).items():
        scenes.append({
            "key": key,
            "mapPath": scene.get("mapPath", ""),
            "tilesetName": scene.get("tilesetName", ""),
            "layers": scene.get("layers", []),
        })
    return {"scenes": scenes}
