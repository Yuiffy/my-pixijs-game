"""Exercise the actual MCP transport, not just a configuration entry."""
import asyncio
from datetime import timedelta
import json
import os
from pathlib import Path
import sys
import tomllib

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def main():
    registered = "--registered" in sys.argv
    if registered:
        config_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
        config = tomllib.loads((config_home / "config.toml").read_text(encoding="utf-8"))
        server = config["mcp_servers"]["blender-local"]
        parameters = StdioServerParameters(command=server["command"], args=server.get("args", []), env={**os.environ, **server.get("env", {})})
    else:
        parameters = StdioServerParameters(command=sys.executable, args=[str(Path(__file__).with_name("codex_bridge.py"))], env=dict(os.environ))
    async with stdio_client(parameters) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            listing = await session.list_tools()
            report = {"transport": "stdio", "registered_config": registered, "tools": [tool.name for tool in listing.tools]}
            for name, args in [("get_blender_version", {}), ("execute_python", {"code": "import bpy, json\nbpy.ops.object.select_all(action='SELECT')\nbpy.ops.object.delete(use_global=False)\nbpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8)\nbpy.context.object.name = 'CodexConnectionVerified'\nprint(json.dumps({'created': bpy.context.object.name, 'vertices': len(bpy.context.object.data.vertices)}))"})]:
                result = await session.call_tool(name, args)
                if result.isError:
                    raise RuntimeError(str(result.content))
                report[name] = [item.text for item in result.content if item.type == "text"]
            if "--build" in sys.argv:
                result = await session.call_tool("run_asset_builder", {"script_path": "scripts/blender/build_after_hours.py", "output_dir": "public/games/after-hours"}, read_timeout_seconds=timedelta(seconds=330))
                if result.isError:
                    raise RuntimeError(str(result.content))
                report["build"] = [item.text for item in result.content if item.type == "text"]
            if "--inspect" in sys.argv:
                report["scenes"] = []
                for name in ["apartment", "sui"]:
                    result = await session.call_tool("inspect_scene", {"blend_file": f"assets/after-hours/{name}.blend"})
                    if result.isError:
                        raise RuntimeError(str(result.content))
                    output = json.loads(next(item.text for item in result.content if item.type == "text"))
                    line = next(line for line in output["stdout"].splitlines() if line.startswith("CODEX_BLENDER_SCENE="))
                    scene = json.loads(line.split("=", 1)[1])
                    report["scenes"].append({"file": scene["file"], "objects": len(scene["objects"]), "meshes": sum(obj["type"] == "MESH" for obj in scene["objects"]), "materials": scene["materials"], "images": scene["images"], "pivots": [obj["name"] for obj in scene["objects"] if obj["type"] == "EMPTY"]})
            target = Path(parameters.env["BLENDER_PROJECT_ROOT"]) / "tmp/blender-mcp/connection-report.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(report, indent=2), encoding="utf-8")
            print(json.dumps(report, indent=2))


asyncio.run(main())
