"""Local, headless Blender MCP. No GUI add-on or paid service is required."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import tempfile

from mcp.server.fastmcp import FastMCP

BLENDER = Path(os.environ["BLENDER_EXECUTABLE"])
ROOT = Path(os.environ["BLENDER_PROJECT_ROOT"]).resolve()
mcp = FastMCP("Blender Local", instructions="Author editable Blender scenes and export web-ready GLB assets in the configured project. Run Python through bpy; use inspect_scene after edits. Background rendering does not open a desktop window.")


def project_path(value: str) -> Path:
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError("Path must stay inside BLENDER_PROJECT_ROOT")
    return path


def run_blender(script: Path, blend: Path | None = None, args: list[str] | None = None) -> dict:
    command = [str(BLENDER), "--background", "--factory-startup", "--disable-autoexec"]
    if blend is not None:
        command.append(str(blend))
    command += ["--python-exit-code", "1", "--python", str(script)]
    if args:
        command += ["--", *args]
    # Blender otherwise inherits the live MCP stdin pipe and can wait on it
    # during startup on Windows. The JSON-RPC pipe belongs only to this server.
    result = subprocess.run(command, cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=300, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    if result.returncode != 0:
        raise RuntimeError((result.stderr + result.stdout)[-12000:])
    return {"exit_code": result.returncode, "stdout": result.stdout[-12000:], "stderr": result.stderr[-2000:]}


@mcp.tool()
def get_blender_version() -> str:
    """Check the installed Blender binary and configured project root."""
    result = subprocess.run([str(BLENDER), "--version"], capture_output=True, text=True, timeout=20, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    result.check_returncode()
    return json.dumps({"version": result.stdout.splitlines()[0], "executable": str(BLENDER), "project_root": str(ROOT)})


@mcp.tool()
def execute_python(code: str, blend_file: str = "") -> dict:
    """Execute bpy Python in a fresh Blender process. Explicitly save/export to persist edits. Optional blend_file is relative to the project root; use absolute project paths in bpy file operations. The process is isolated from interactive Blender sessions."""
    directory = ROOT / "tmp" / "blender-mcp"
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", encoding="utf-8", dir=directory, delete=False) as handle:
        handle.write(code)
        script = Path(handle.name)
    try:
        return run_blender(script, project_path(blend_file) if blend_file else None)
    finally:
        script.unlink(missing_ok=True)


@mcp.tool()
def run_asset_builder(script_path: str, output_dir: str) -> dict:
    """Run a repository asset-authoring script with --output. Both paths are relative to the project root. The authoring script can save .blend sources and export .glb models."""
    script, output = project_path(script_path), project_path(output_dir)
    output.mkdir(parents=True, exist_ok=True)
    return run_blender(script, args=["--output", str(output)])


@mcp.tool()
def inspect_scene(blend_file: str) -> dict:
    """Read object names, hierarchy, geometry/material budgets, cameras and bounds from an existing .blend file."""
    return execute_python("""import bpy, json
from mathutils import Vector
objects = [{"name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None, "dimensions": list(o.dimensions), "vertices": len(o.data.vertices) if o.type == 'MESH' else 0} for o in bpy.context.scene.objects]
print('CODEX_BLENDER_SCENE=' + json.dumps({"file": bpy.data.filepath, "objects": objects, "materials": len(bpy.data.materials), "images": [{"name": i.name, "size": list(i.size)} for i in bpy.data.images]}))
""", blend_file)


@mcp.tool()
def render_scene(blend_file: str, output_file: str, resolution: int = 960) -> dict:
    """Render the scene's active camera to a project PNG using Eevee. Resolution is clamped to 256–1920; preserves the source file."""
    target = project_path(output_file)
    target.parent.mkdir(parents=True, exist_ok=True)
    size = min(1920, max(256, resolution))
    return execute_python(f"""import bpy
s = bpy.context.scene
s.render.engine = 'BLENDER_EEVEE_NEXT'
s.render.resolution_x = {size}
s.render.resolution_y = {round(size * 0.625)}
s.render.resolution_percentage = 100
s.render.image_settings.file_format = 'PNG'
s.render.filepath = {str(target)!r}
bpy.ops.render.render(write_still=True)
""", blend_file)


if __name__ == "__main__":
    mcp.run(transport="stdio")
