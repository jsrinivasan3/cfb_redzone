import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import streams as streams_store
from .espn import fetch_scoreboard
from .scoring import normalize_and_score

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
POLL_SECONDS = 20

state = {
    "games": [],
    "last_updated": None,
    "error": None,
}
_prev_event_state: dict[str, dict] = {}


async def poll_loop():
    while True:
        try:
            data = await fetch_scoreboard()
            games = []
            for event in data.get("events", []):
                try:
                    prev = _prev_event_state.get(event["id"])
                    game, new_prev = normalize_and_score(event, prev)
                    _prev_event_state[event["id"]] = new_prev
                    games.append(game)
                except Exception:
                    continue  # skip a single malformed event rather than lose the whole slate

            streams = streams_store.load_streams()
            for g in games:
                g["stream_url"] = streams.get(g["id"], "")

            games.sort(key=lambda g: g["interest_score"], reverse=True)
            state["games"] = games
            state["error"] = None
        except Exception as exc:
            state["error"] = str(exc)
        finally:
            import datetime
            state["last_updated"] = datetime.datetime.now().isoformat()
        await asyncio.sleep(POLL_SECONDS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(poll_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)


class StreamUpdate(BaseModel):
    event_id: str
    url: str


@app.get("/api/games")
async def get_games():
    return {
        "games": state["games"],
        "last_updated": state["last_updated"],
        "error": state["error"],
    }


@app.post("/api/streams")
async def set_stream(update: StreamUpdate):
    streams = streams_store.save_stream(update.event_id, update.url)
    for g in state["games"]:
        if g["id"] == update.event_id:
            g["stream_url"] = streams.get(update.event_id, "")
    return {"ok": True, "streams": streams}


@app.get("/api/streams")
async def get_streams():
    return streams_store.load_streams()


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")
