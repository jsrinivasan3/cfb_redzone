"""Thin client for ESPN's public (unauthenticated) college football JSON endpoints."""
import httpx

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"

# groups=80 -> FBS only (keeps FCS/other games out of a Saturday slate)
DEFAULT_PARAMS = {"groups": "80", "limit": "200"}


async def fetch_scoreboard(dates: str | None = None) -> dict:
    params = dict(DEFAULT_PARAMS)
    if dates:
        params["dates"] = dates
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(SCOREBOARD_URL, params=params)
        resp.raise_for_status()
        return resp.json()
