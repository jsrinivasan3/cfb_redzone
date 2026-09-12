# CFB RedZone

A local "RedZone"-style dashboard for college football Saturdays. It shows 6
live game tiles at once and automatically surfaces the most interesting ones
— close games, red zone alerts, ranked matchups, lead changes — so you know
what to flip to. Add your own stream link to any game and pop it into a
larger in-app player with the score overlaid.

Scores and schedule data come from ESPN's public scoreboard API (no API key
needed). **This app does not source, scrape, or embed any video stream on
its own** — you paste in a link per game from a source you already have
legitimate access to (a subscription service, a network's own site/app, an
authorized channel, etc.), and the app just displays it.

## Features

- Auto-ranked grid of the 6 most interesting games right now, based on:
  score margin vs. time remaining, ESPN's live red-zone flag, 4th
  quarter/OT closeness, ranked (AP Top 25) matchups, and recent lead
  changes. Games that haven't kicked off yet are ranked by projected
  matchup quality (rankings + point spread).
- "All Games Today" panel to see the full slate, manually pin any game into
  a specific grid slot, or set/edit its stream link.
- Click a tile to pop the stream into a full-size in-app player with a
  persistent score overlay. Works with YouTube and Twitch links (auto
  converted to embeds), direct `.m3u8` streams, or any other page link
  (falls back to an "open in new tab" button if a site blocks embedding).

## Requirements

- Python 3.10+
- A modern web browser

## Setup

```bash
git clone https://github.com/jsrinivasan3/cfb_redzone.git
cd cfb_redzone
python3 -m venv .venv
source .venv/bin/activate      # on Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Running it

```bash
source .venv/bin/activate      # if not already active
uvicorn backend.main:app --reload --port 8000
```

Then open **http://localhost:8000** in your browser.

Leave the terminal running while you use it — it refreshes scores from ESPN
every ~20 seconds in the background, and the page itself re-polls the
backend every ~15 seconds.

## Using it

- The main grid always shows 6 tiles, auto-picked by "interest score."
- Click **All Games** (top right) to open the full Saturday slate. From
  there you can:
  - Set the dropdown next to a game to **Slot 1–6** to pin it into that
    exact grid position, or back to **Auto** to let the app pick again.
  - Click **Set stream** / **Edit link** to paste in that game's stream
    URL.
- Click anywhere on a tile's video area to pop it into the larger modal
  player.
- Stream links are stored locally in `data/streams.json`, keyed by ESPN's
  game ID for that week — they won't carry over automatically once that
  week's matchups are gone, since the IDs change. That file is git-ignored
  since it's personal/local data.

## Project structure

```
backend/
  main.py       FastAPI app, background ESPN polling loop, API routes
  espn.py       ESPN scoreboard API client
  scoring.py    "Interest score" + badge logic for each game
  streams.py    Reads/writes your stream links to data/streams.json
frontend/
  index.html    Page layout
  app.js        Grid rendering, pinning, modal player, embed detection
  style.css     Dark "RedZone" theme
data/
  streams.json  Your stream links (created automatically, git-ignored)
```

## Customizing

- **FBS-only filter**: `backend/espn.py` requests `groups=80` (FBS games
  only). Remove that param to include FCS games too.
- **Poll interval**: `POLL_SECONDS` in `backend/main.py` (backend → ESPN)
  and `POLL_MS` in `frontend/app.js` (browser → backend).
- **Scoring weights**: all in `backend/scoring.py` if you want games with
  ranked teams, red zone situations, etc. weighted differently.
