from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_expected_core_files_exist():
    expected = [
        "README.md",
        "manifest.json",
        "src/background/service-worker.js",
        "src/background/media-core.js",
        "src/popup/popup.js",
        "src/lib/messages.js",
        "docs/GUIDE_BONNES_PRATIQUES.md",
    ]
    for relative in expected:
        assert (ROOT / relative).exists(), f"Missing expected file: {relative}"


def test_cursor_rule_exists():
    assert (ROOT / ".cursor/rules/extension-guidelines.mdc").exists()
