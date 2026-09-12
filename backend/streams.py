"""Persists the user's own stream-link-per-game mapping to a local JSON file."""
import json
from pathlib import Path

STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "streams.json"


def load_streams() -> dict[str, str]:
    if not STORE_PATH.exists():
        return {}
    try:
        return json.loads(STORE_PATH.read_text())
    except (json.JSONDecodeError, OSError):
        return {}


def save_stream(event_id: str, url: str) -> dict[str, str]:
    streams = load_streams()
    if url:
        streams[event_id] = url
    else:
        streams.pop(event_id, None)
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(streams, indent=2))
    return streams
