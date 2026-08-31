#!/usr/bin/env python3
"""Decode original PWA icons from assets/icons-base64.json into repo root."""
import base64, json, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / "assets" / "icons-base64.json"
data = json.loads(p.read_text())
for name, b64 in data.items():
    out = pathlib.Path(__file__).resolve().parent.parent / name
    out.write_bytes(base64.b64decode(b64))
    print("wrote", out)
