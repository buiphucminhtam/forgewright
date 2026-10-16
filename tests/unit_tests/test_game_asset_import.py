import hashlib
import importlib.util
import json
import struct
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "game_asset_import", ROOT / "scripts/art-direction/game_asset_import.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def glb(document):
    data = json.dumps(document).encode()
    data += b" " * ((-len(data)) % 4)
    return (
        b"glTF"
        + struct.pack("<II", 2, 20 + len(data))
        + struct.pack("<I4s", len(data), b"JSON")
        + data
    )


def sprite(tmp_path):
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        )

    path = tmp_path / "hero.png"
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 32, 16, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress((b"\0" + bytes(32 * 4)) * 16))
        + chunk(b"IEND", b"")
    )
    contract = {
        "kind": "sprite",
        "frame_width": 16,
        "frame_height": 16,
        "frame_count": 2,
        "anchor": [0.5, 1],
        "scale": 1,
        "animations": ["idle"],
    }
    observation = {
        "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "engine": {"name": "phaser", "version": "4.2.1"},
        "import": contract.copy(),
    }
    return path, contract, observation


def test_sprite_dimensions_anchor_animation_and_source_must_agree(tmp_path):
    path, contract, observation = sprite(tmp_path)
    assert (
        module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
        == []
    )
    contract["frame_count"] = 3
    assert any(
        "frames" in e
        for e in module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
    )
    contract["frame_count"] = 2
    observation["import"]["anchor"] = [0, 0]
    assert any(
        "anchor" in e
        for e in module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
    )
    observation["source_sha256"] = "0" * 64
    assert any(
        "source" in e
        for e in module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
    )


def test_glb_animations_and_units_not_forced_on_static_prop(tmp_path):
    path = tmp_path / "ship.glb"
    path.write_bytes(
        glb(
            {
                "asset": {"version": "2.0"},
                "nodes": [{"name": "ship"}],
                "animations": [{"name": "idle", "channels": [], "samplers": []}],
            }
        )
    )
    contract = {
        "kind": "model",
        "units": "meters",
        "up_axis": "Y",
        "pivot": [0, 0, 0],
        "scale": 1,
        "animations": ["idle"],
    }
    observation = {
        "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "engine": {"name": "threejs", "version": "0.183.2"},
        "import": contract.copy(),
    }
    assert (
        module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
        == []
    )
    contract["animations"] = ["run"]
    assert any(
        "clip" in e
        for e in module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
    )
    contract["animations"] = []
    observation["import"]["animations"] = []
    assert (
        module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
        == []
    )
    observation["import"]["units"] = "centimeters"
    assert any(
        "units" in e
        for e in module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
    )


@pytest.mark.parametrize("change", ["nan", "truncated", "engine", "negative_frame"])
def test_invalid_import_cannot_be_accepted(tmp_path, change):
    path, contract, observation = sprite(tmp_path)
    if change == "nan":
        contract["scale"] = float("nan")
    elif change == "truncated":
        path.write_bytes(b"bad PNG")
        observation["source_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    elif change == "engine":
        observation["engine"]["version"] = "3.80.0"
    else:
        contract["frame_width"] = -1
    assert module.validate_asset_import(
        contract,
        source_path=path,
        engine={"name": "phaser", "version": "4.2.1"},
        observation=observation,
    )


def test_static_environment_image_and_corrupt_png_tail_are_detected(tmp_path):
    path = tmp_path / "garden.svg"
    path.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480"/></svg>'
    )
    contract = {"kind": "image", "width": 640, "height": 480}
    observation = {
        "source_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "engine": {"name": "phaser", "version": "4.2.1"},
        "import": contract.copy(),
    }
    assert (
        module.validate_asset_import(
            contract,
            source_path=path,
            engine=observation["engine"],
            observation=observation,
        )
        == []
    )
    path, contract, observation = sprite(tmp_path)
    path.write_bytes(path.read_bytes() + b"corrupted-tail")
    observation["source_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
    assert module.validate_asset_import(
        contract,
        source_path=path,
        engine=observation["engine"],
        observation=observation,
    )
