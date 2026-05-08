import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_manifest_has_required_mv3_fields():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["manifest_version"] == 3
    assert "background" in manifest
    assert "service_worker" in manifest["background"]
    assert "permissions" in manifest


def test_manifest_permissions_are_not_empty():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    assert isinstance(manifest["permissions"], list)
    assert len(manifest["permissions"]) > 0
