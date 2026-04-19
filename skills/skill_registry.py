"""
Skill Registry - 技能注册管理器

自动加载 skills/ 目录下的所有 .md 文件，解析 YAML frontmatter 元数据，
管理技能的启用/禁用状态。所有启用的技能全部注入 system prompt，
由 LLM 根据 skill description 自主决定是否使用。
"""
import os
import json
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field

import frontmatter


@dataclass
class SkillDefinition:
    """技能定义"""
    name: str  # 技能名称（唯一标识，对应目录名）
    description: str  # LLM 可读的详细描述（何时使用、覆盖范围）
    content: str  # 技能正文（使用指南）
    metadata: Dict[str, Any] = field(default_factory=dict)
    is_enabled: bool = True
    source_file: str = ""

    def to_info(self) -> Dict[str, Any]:
        """转换为前端可用的信息字典"""
        return {
            "name": self.name,
            "description": self.description,
            "is_enabled": self.is_enabled,
            "source_file": self.source_file,
            "metadata": self.metadata,
            "preview": self.content[:500] + "..." if len(self.content) > 500 else self.content,
        }

    def get_full_content(self) -> str:
        """获取完整内容"""
        return self.content

    def get_prompt_section(self) -> str:
        """生成用于 system prompt 的技能描述段落"""
        emoji = self.metadata.get("emoji", "")
        header = f"{emoji} {self.name}" if emoji else self.name
        return f"""## {header}
{self.description}
"""


class SkillRegistry:
    """技能注册管理器"""

    SKILL_DIRS = ["skills", "skills/examples"]

    def __init__(self):
        self.skills: Dict[str, SkillDefinition] = {}
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.config_file = os.path.join(base_dir, "data", "skills_config.json")
        self.skill_dirs = [os.path.join(base_dir, d) for d in self.SKILL_DIRS]
        self._ensure_dirs()
        self._load()

    def _ensure_dirs(self):
        os.makedirs(os.path.dirname(self.config_file), exist_ok=True)
        for d in self.skill_dirs:
            os.makedirs(d, exist_ok=True)

    def _load(self):
        self._scan_skill_files()
        self._load_config()
        print(f"✅ 已加载 {len(self.skills)} 个技能")

    def _scan_skill_files(self):
        loaded_files = set()
        for skill_dir in self.skill_dirs:
            if not os.path.exists(skill_dir):
                continue
            for root, _dirs, files in os.walk(skill_dir):
                for filename in files:
                    if not filename.endswith(".md"):
                        continue
                    filepath = os.path.join(root, filename)
                    if filepath in loaded_files:
                        continue
                    loaded_files.add(filepath)
                    try:
                        skill = self._parse_skill_file(filepath)
                        if skill:
                            self.skills[skill.name] = skill
                    except Exception as e:
                        print(f"⚠️ 解析技能文件失败 {filepath}: {e}")

    def _parse_skill_file(self, filepath: str) -> Optional[SkillDefinition]:
        post = frontmatter.load(filepath)
        meta = post.metadata or {}

        name = meta.get("name", "")
        if not name:
            name = os.path.splitext(os.path.basename(filepath))[0]

        description = meta.get("description", "")
        metadata = meta.get("metadata", {})
        content = post.content.strip()

        return SkillDefinition(
            name=name,
            description=description,
            content=content,
            metadata=metadata,
            source_file=filepath,
        )

    def _load_config(self):
        if not os.path.exists(self.config_file):
            return
        try:
            with open(self.config_file, "r", encoding="utf-8") as f:
                config = json.load(f)
            for skill_name, enabled in config.get("enabled", {}).items():
                if skill_name in self.skills:
                    self.skills[skill_name].is_enabled = enabled
        except Exception as e:
            print(f"⚠️ 加载技能配置失败: {e}")

    def _save_config(self):
        try:
            config = {
                "enabled": {
                    name: skill.is_enabled
                    for name, skill in self.skills.items()
                }
            }
            with open(self.config_file, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"⚠️ 保存技能配置失败: {e}")
            return False

    def list_skills(self, include_disabled: bool = False) -> List[SkillDefinition]:
        skills = list(self.skills.values())
        if not include_disabled:
            skills = [s for s in skills if s.is_enabled]
        return skills

    def get_skill(self, name: str) -> Optional[SkillDefinition]:
        return self.skills.get(name)

    def get_enabled_skills(self) -> List[SkillDefinition]:
        return [s for s in self.skills.values() if s.is_enabled]

    def set_skill_enabled(self, name: str, enabled: bool) -> bool:
        if name not in self.skills:
            return False
        self.skills[name].is_enabled = enabled
        return self._save_config()

    def get_skills_prompt(self, skill_names: Optional[List[str]] = None) -> str:
        """
        生成注入 system prompt 的技能说明文本。

        所有启用的技能全部列出，由 LLM 根据 description 自主决定何时使用。

        Args:
            skill_names: 可选，只包含指定名称的技能。不传则包含所有已启用的技能。

        Returns:
            格式化后的 skills prompt 段落，空字符串表示无可用技能。
        """
        enabled = self.get_enabled_skills()
        if not enabled:
            return ""

        if skill_names is not None:
            enabled = [s for s in enabled if s.name in skill_names]

        if not enabled:
            return ""

        sections = [s.get_prompt_section() for s in enabled]
        skills_block = "\n".join(sections)

        return f"""# 可用技能

你有以下技能可供使用。根据用户请求的上下文，判断是否需要使用某个技能。如果不需要，直接按正常对话回复即可。

{skills_block}
"""

    def reload(self):
        self.skills.clear()
        self._load()


# 全局单例
skill_registry = SkillRegistry()
