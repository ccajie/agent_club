# -*- coding: utf-8 -*-
"""API routes for skill management."""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from skills import skill_registry

router = APIRouter(prefix="/api/skills", tags=["skills"])


class UpdateSkillRequest(BaseModel):
    """更新技能状态请求"""
    is_enabled: bool = Field(..., description="是否启用")


@router.get("")
async def list_skills(include_disabled: bool = False):
    """获取所有技能列表"""
    skills = skill_registry.list_skills(include_disabled=include_disabled)
    return {
        "skills": [skill.to_info() for skill in skills],
        "total": len(skills),
    }


@router.get("/{skill_name}")
async def get_skill(skill_name: str):
    """获取单个技能详情"""
    skill = skill_registry.get_skill(skill_name)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    info = skill.to_info()
    info["content"] = skill.get_full_content()
    return info


@router.put("/{skill_name}")
async def update_skill(skill_name: str, request: UpdateSkillRequest):
    """更新技能启用状态"""
    success = skill_registry.set_skill_enabled(skill_name, request.is_enabled)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill = skill_registry.get_skill(skill_name)
    return {
        "success": True,
        "skill": skill.to_info() if skill else None,
    }


@router.post("/{skill_name}/enable")
async def enable_skill(skill_name: str):
    """启用技能"""
    success = skill_registry.set_skill_enabled(skill_name, True)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill = skill_registry.get_skill(skill_name)
    return {
        "success": True,
        "skill": skill.to_info() if skill else None,
    }


@router.post("/{skill_name}/disable")
async def disable_skill(skill_name: str):
    """禁用技能"""
    success = skill_registry.set_skill_enabled(skill_name, False)
    if not success:
        raise HTTPException(status_code=404, detail="Skill not found")

    skill = skill_registry.get_skill(skill_name)
    return {
        "success": True,
        "skill": skill.to_info() if skill else None,
    }
