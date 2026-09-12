"""Turns a raw ESPN scoreboard event into a normalized game dict with an
'interest score' and human-readable badges, so the frontend can rank and
highlight what's worth watching right now."""

RANKED_CUTOFF = 26  # curatedRank.current >= 26 means "unranked" in ESPN's data
MAJOR_NETWORKS = {"ABC", "ESPN", "FOX", "CBS", "NBC", "ESPN2"}


def _clock_seconds(display_clock: str) -> int:
    try:
        mins, secs = display_clock.split(":")
        return int(mins) * 60 + int(secs)
    except Exception:
        return 999


def _team_view(competitor: dict) -> dict:
    team = competitor.get("team", {})
    rank = (competitor.get("curatedRank") or {}).get("current", 99)
    records = competitor.get("records") or []
    summary = records[0].get("summary") if records else ""
    return {
        "name": team.get("displayName", "Unknown"),
        "abbrev": team.get("abbreviation", "?"),
        "logo": team.get("logo", ""),
        "score": int(competitor.get("score", 0) or 0),
        "rank": rank if rank and rank < RANKED_CUTOFF else None,
        "record": summary,
        "home_away": competitor.get("homeAway", ""),
    }


def normalize_and_score(event: dict, prev_state: dict | None) -> tuple[dict, dict]:
    """Returns (game_dict, new_prev_state_for_this_event)."""
    competition = event["competitions"][0]
    status = event.get("status", {})
    status_type = status.get("type", {})
    state = status_type.get("state", "pre")  # pre | in | post
    period = status.get("period", 0)
    display_clock = status.get("displayClock", "0:00")

    competitors = competition.get("competitors", [])
    home = next((c for c in competitors if c.get("homeAway") == "home"), competitors[0])
    away = next((c for c in competitors if c.get("homeAway") == "away"), competitors[-1])
    home_v = _team_view(home)
    away_v = _team_view(away)

    situation = competition.get("situation", {}) or {}
    is_redzone = bool(situation.get("isRedZone", False))
    down_distance = situation.get("downDistanceText", "")
    possession_id = situation.get("possession")
    possession_side = None
    if possession_id:
        if possession_id == home.get("id"):
            possession_side = "home"
        elif possession_id == away.get("id"):
            possession_side = "away"

    odds = competition.get("odds") or []
    spread = odds[0].get("spread") if odds else None

    broadcasts = competition.get("broadcasts") or []
    networks = [n for b in broadcasts for n in b.get("names", [])]
    is_major_network = any(n in MAJOR_NETWORKS for n in networks)

    prev_state = prev_state or {}
    score = 0.0
    badges: list[str] = []

    margin = abs(home_v["score"] - away_v["score"])
    both_ranked = home_v["rank"] is not None and away_v["rank"] is not None
    either_ranked = home_v["rank"] is not None or away_v["rank"] is not None

    if state == "in":
        score += 20
        clock_secs = _clock_seconds(display_clock)

        # closeness matters more as the game (and clock) winds down
        quarter_weight = min(period, 4) / 4.0
        score += max(0, 28 - margin) * quarter_weight

        if period >= 4 and margin <= 8:
            score += 25
            badges.append("🔥 Close Game")
        if period >= 4 and clock_secs <= 120 and margin <= 8:
            score += 20
            badges.append("⏱️ Under 2 Min")
        if period >= 5:
            score += 30
            badges.append("⚡ Overtime")

        if is_redzone:
            score += 25
            badges.append("🔴 RED ZONE")

        if both_ranked:
            score += 15
            badges.append(f"🏆 #{home_v['rank']} vs #{away_v['rank']}")
        elif either_ranked:
            score += 8

        prev_leader = prev_state.get("leader")
        if home_v["score"] > away_v["score"]:
            leader = "home"
        elif away_v["score"] > home_v["score"]:
            leader = "away"
        else:
            leader = "tied"
        if prev_leader and prev_leader != leader:
            score += 15
            badges.append("↔️ Lead Change")

        prev_total = prev_state.get("total", 0)
        new_total = home_v["score"] + away_v["score"]
        if new_total > prev_total:
            score += 5

    elif state == "pre":
        # projected-matchup quality, before kickoff
        if both_ranked:
            score += 40 - min(home_v["rank"], away_v["rank"])
            badges.append(f"🏆 #{home_v['rank']} vs #{away_v['rank']}")
        elif either_ranked:
            score += 12
        if spread is not None:
            try:
                if abs(float(spread)) <= 7:
                    score += 15
                    badges.append("📊 Projected Close Game")
            except (TypeError, ValueError):
                pass
        if is_major_network:
            score += 8
            badges.append("📺 " + "/".join(sorted(set(networks) & MAJOR_NETWORKS)))

    else:  # post
        score = -1

    game = {
        "id": event["id"],
        "name": event.get("shortName", event.get("name", "")),
        "start_time": event.get("date"),
        "state": state,
        "status_detail": status_type.get("shortDetail", ""),
        "period": period,
        "clock": display_clock,
        "down_distance": down_distance if state == "in" else "",
        "possession_side": possession_side,
        "is_redzone": is_redzone,
        "home": home_v,
        "away": away_v,
        "networks": networks,
        "interest_score": round(score, 1),
        "badges": badges,
    }
    new_state = {
        "leader": (
            "home" if home_v["score"] > away_v["score"]
            else "away" if away_v["score"] > home_v["score"]
            else "tied"
        ),
        "total": home_v["score"] + away_v["score"],
    }
    return game, new_state
