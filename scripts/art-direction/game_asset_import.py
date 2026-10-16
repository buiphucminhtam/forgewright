"""Source-format and import-observation checks, not a runtime renderer oracle."""

from __future__ import annotations

import hashlib
import json
import math
import struct
import zlib
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any


def finite(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def image_size(data: bytes) -> tuple[int, int]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        cursor = 8
        size = None
        idat = False
        ended = False
        while cursor + 12 <= len(data):
            length = struct.unpack(">I", data[cursor : cursor + 4])[0]
            end = cursor + 12 + length
            if end > len(data):
                raise ValueError("truncated PNG chunk")
            kind = data[cursor + 4 : cursor + 8]
            payload = data[cursor + 8 : cursor + 8 + length]
            crc = struct.unpack(">I", data[cursor + 8 + length : end])[0]
            if zlib.crc32(kind + payload) & 0xFFFFFFFF != crc:
                raise ValueError("PNG CRC mismatch")
            if kind == b"IHDR":
                if size is not None or length != 13:
                    raise ValueError("invalid PNG IHDR")
                size = struct.unpack(">II", payload[:8])
            if kind == b"IDAT":
                idat = True
            if kind == b"IEND":
                if length or end != len(data):
                    raise ValueError("invalid PNG end")
                ended = True
                break
            cursor = end
        if not size or not idat or not ended or min(size) <= 0:
            raise ValueError("incomplete PNG")
        return size
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("SVG declarations unsupported")
    element = ET.fromstring(data)
    if element.tag.split("}")[-1] != "svg":
        raise ValueError("SVG root required")
    width, height = (int(element.attrib[key]) for key in ["width", "height"])
    if min(width, height) <= 0:
        raise ValueError("positive image dimensions required")
    return width, height


def validate_asset_import(
    contract: dict[str, Any],
    *,
    source_path: Path,
    engine: dict[str, str],
    observation: dict[str, Any],
) -> list[str]:
    errors = []
    data = source_path.read_bytes()
    if not isinstance(observation, dict):
        return ["import observation must be an object"]
    if observation.get("source_sha256") != hashlib.sha256(data).hexdigest():
        errors.append("source hash differs from import observation")
    if observation.get("engine") != engine:
        errors.append("engine/version differs from import observation")
    if not finite(contract.get("scale", 1)) or contract.get("scale", 1) <= 0:
        errors.append("scale must be finite and positive")
    kind = contract.get("kind")
    observed = observation.get("import", {})
    if not isinstance(observed, dict):
        return errors + ["import observation must be an object"]
    for key, value in contract.items():
        if observed.get(key) != value:
            errors.append(f"{key} differs from import observation")
    if kind == "sprite":
        if engine.get("name") != "phaser":
            errors.append("sprite contract requires Phaser")
        try:
            width, height = image_size(data)
        except (ValueError, KeyError, ET.ParseError, struct.error):
            return errors + ["sprite image structure is invalid"]
        fw, fh, count = (
            contract.get(key) for key in ["frame_width", "frame_height", "frame_count"]
        )
        if any(
            not isinstance(v, int) or isinstance(v, bool) or v <= 0
            for v in [fw, fh, count]
        ):
            return errors + ["frame dimensions/count must be positive integers"]
        if width % fw or height % fh or (width // fw) * (height // fh) != count:
            errors.append("source frames do not match sheet dimensions")
        anchor = contract.get("anchor")
        if (
            not isinstance(anchor, list)
            or len(anchor) != 2
            or any(not finite(v) or not 0 <= v <= 1 for v in anchor)
        ):
            errors.append("anchor needs two normalized finite coordinates")
        animations = contract.get("animations")
        if (
            not isinstance(animations, list)
            or not animations
            or any(not isinstance(a, str) or not a for a in animations)
        ):
            errors.append("sprite requires named animation keys")
    elif kind == "model":
        if engine.get("name") != "threejs":
            errors.append("model contract requires Three.js")
        try:
            if data[:4] == b"glTF":
                if len(data) < 20:
                    raise ValueError("truncated GLB")
                version, length, chunk_length, chunk_type = struct.unpack(
                    "<III4s", data[4:20]
                )
                if (
                    version != 2
                    or length != len(data)
                    or chunk_type != b"JSON"
                    or 20 + chunk_length > len(data)
                ):
                    raise ValueError("invalid GLB 2 header")
                source = json.loads(data[20 : 20 + chunk_length])
            else:
                source = json.loads(data)
            if source.get("asset", {}).get("version") != "2.0":
                raise ValueError("glTF 2.0 required")
            clips = {
                a.get("name")
                for a in source.get("animations", [])
                if isinstance(a, dict)
            }
            expected = contract.get("animations", [])
            if not isinstance(expected, list) or any(
                not isinstance(name, str) or name not in clips for name in expected
            ):
                errors.append("required animation clip absent from glTF source")
        except (ValueError, TypeError, AttributeError, struct.error):
            errors.append("readable GLB/glTF 2.0 source required")
        if contract.get("units") != "meters" or contract.get("up_axis") != "Y":
            errors.append("glTF runtime units/up_axis must be meters/Y")
        pivot = contract.get("pivot")
        if (
            not isinstance(pivot, list)
            or len(pivot) != 3
            or any(not finite(v) for v in pivot)
        ):
            errors.append("pivot requires three finite coordinates")
    elif kind in ("ui", "image"):
        try:
            width, height = image_size(data)
            if contract.get("width") != width or contract.get("height") != height:
                errors.append("image dimensions differ from import contract")
        except (ValueError, KeyError, ET.ParseError, struct.error):
            errors.append("readable PNG/SVG image required")
        margins = contract.get("nine_slice")
        if margins is not None and (
            not isinstance(margins, list)
            or len(margins) != 4
            or any(not finite(v) or v < 0 for v in margins)
        ):
            errors.append("nine_slice needs four finite non-negative margins")
    else:
        errors.append("import kind must be sprite, model, image or ui")
    return errors
