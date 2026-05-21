from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import FormTemplate


def canonicalize_recipe(recipe: FormTemplate | dict[str, Any]) -> FormTemplate:
    if isinstance(recipe, FormTemplate):
        return recipe
    return FormTemplate.model_validate(recipe)


def dump_recipe_json(recipe: FormTemplate | dict[str, Any]) -> str:
    template = canonicalize_recipe(recipe)
    payload = template.model_dump(mode="json", exclude_none=True)
    return json.dumps(payload, indent=2) + "\n"


def load_recipe(path: Path) -> FormTemplate:
    return FormTemplate.model_validate_json(path.read_text())


def save_recipe(path: Path, recipe: FormTemplate | dict[str, Any]) -> FormTemplate:
    template = canonicalize_recipe(recipe)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_recipe_json(template))
    return template
