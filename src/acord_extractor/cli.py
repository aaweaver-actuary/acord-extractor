from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import typer
import uvicorn

from .api import app as api_app
from .debug_overlay import export_debug_overlay
from .extract import extract_pdf
from .preview import preview_field, preview_template
from .recipe_io import load_recipe, save_recipe
from .validation import validate_template


app = typer.Typer(no_args_is_help=True)


def _jsonable(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _emit_json(value: Any) -> None:
    typer.echo(json.dumps(_jsonable(value), indent=2))


@app.command("preview")
def preview_command(
    pdf: Path = typer.Option(..., exists=True, dir_okay=False),
    recipe: Path = typer.Option(..., exists=True, dir_okay=False),
    field_id: str | None = typer.Option(None),
) -> None:
    template = load_recipe(recipe)
    result = (
        preview_field(pdf, template, field_id)
        if field_id
        else preview_template(pdf, template)
    )
    _emit_json(result)


@app.command("extract")
def extract_command(
    pdf: Path = typer.Option(..., exists=True, dir_okay=False),
    recipe: Path = typer.Option(..., exists=True, dir_okay=False),
) -> None:
    _emit_json(extract_pdf(pdf, load_recipe(recipe)))


@app.command("validate-template")
def validate_template_command(
    pdf: Path = typer.Option(..., exists=True, dir_okay=False),
    recipe: Path = typer.Option(..., exists=True, dir_okay=False),
) -> None:
    _emit_json(validate_template(pdf, load_recipe(recipe)))


@app.command("export-debug-overlay")
def export_debug_overlay_command(
    pdf: Path = typer.Option(..., exists=True, dir_okay=False),
    recipe: Path = typer.Option(..., exists=True, dir_okay=False),
    output: Path = typer.Option(..., dir_okay=False),
) -> None:
    result = export_debug_overlay(pdf, load_recipe(recipe), output)
    _emit_json({"output_path": str(result)})


@app.command("save-recipe")
def save_recipe_command(
    recipe: Path = typer.Option(..., exists=True, dir_okay=False),
    output: Path = typer.Option(..., dir_okay=False),
) -> None:
    _emit_json(save_recipe(output, load_recipe(recipe)))


@app.command("serve-api")
def serve_api_command(
    host: str = typer.Option("127.0.0.1"),
    port: int = typer.Option(8000, min=1),
) -> None:
    uvicorn.run(api_app, host=host, port=port)
