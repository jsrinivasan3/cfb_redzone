const GRID_SIZE = 6;
const POLL_MS = 15000;
const PIN_KEY = "cfb_redzone_pins_v1";

let latestGames = [];
let pins = loadPins();

function loadPins() {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return Array(GRID_SIZE).fill(null);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === GRID_SIZE) return parsed;
  } catch (e) {}
  return Array(GRID_SIZE).fill(null);
}
function savePins() {
  try { localStorage.setItem(PIN_KEY, JSON.stringify(pins)); } catch (e) {}
}

// ---------- Embed URL detection ----------
function getEmbedInfo(url, muted) {
  if (!url) return { type: "none" };
  try {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) {
      return { type: "iframe", src: `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=${muted ? 1 : 0}` };
    }
    const twitchVod = url.match(/twitch\.tv\/videos\/(\d+)/);
    if (twitchVod) {
      return { type: "iframe", src: `https://player.twitch.tv/?video=${twitchVod[1]}&parent=${location.hostname}&autoplay=true&muted=${muted}` };
    }
    const twitchChannel = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)\/?$/);
    if (twitchChannel) {
      return { type: "iframe", src: `https://player.twitch.tv/?channel=${twitchChannel[1]}&parent=${location.hostname}&autoplay=true&muted=${muted}` };
    }
    if (url.toLowerCase().includes(".m3u8")) {
      return { type: "hls", src: url };
    }
    return { type: "iframe", src: url };
  } catch (e) {
    return { type: "iframe", src: url };
  }
}

function buildVideoEl(embedInfo, muted) {
  if (embedInfo.type === "none") {
    const div = document.createElement("div");
    div.className = "no-stream";
    div.textContent = "No stream link set";
    return div;
  }
  if (embedInfo.type === "hls") {
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = muted;
    video.playsInline = true;
    video.controls = !muted;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = embedInfo.src;
    } else if (window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(embedInfo.src);
      hls.attachMedia(video);
    }
    return video;
  }
  const iframe = document.createElement("iframe");
  iframe.src = embedInfo.src;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  iframe.allowFullscreen = true;
  return iframe;
}

// ---------- Rendering ----------
function teamHtml(team, possessionSide, side) {
  const rank = team.rank ? `<span class="rank">#${team.rank}</span>` : "";
  const arrow = possessionSide === side ? `<span class="possession-arrow">🏈</span>` : "";
  const logo = team.logo ? `<img src="${team.logo}" alt="">` : "";
  return `<div class="team">${logo}<span>${rank}${team.abbrev}</span>${arrow}<span class="score">${team.score}</span></div>`;
}

function badgeHtml(badges) {
  return badges.map(b => `<span class="badge ${b.includes('RED ZONE') || b.includes('Close') || b.includes('Under 2') ? 'hot' : ''}">${b}</span>`).join("");
}

function renderTile(game) {
  const tile = document.createElement("div");
  tile.className = "tile" + (game.is_redzone ? " redzone" : "");
  tile.dataset.gameId = game.id;

  const videoWrap = document.createElement("div");
  videoWrap.className = "tile-video";
  const embedInfo = getEmbedInfo(game.stream_url, true);
  videoWrap.appendChild(buildVideoEl(embedInfo, true));
  if (embedInfo.type !== "none") {
    const overlay = document.createElement("div");
    overlay.className = "play-overlay";
    overlay.textContent = "▶";
    videoWrap.appendChild(overlay);
  }
  videoWrap.addEventListener("click", () => {
    if (embedInfo.type === "none") {
      openStreamEditor(game.id, game.name, game.stream_url || "");
    } else {
      openModal(game);
    }
  });

  const body = document.createElement("div");
  body.className = "tile-body";
  body.innerHTML = `
    <div class="matchup-row">
      ${teamHtml(game.away, game.possession_side, "away")}
    </div>
    <div class="matchup-row">
      ${teamHtml(game.home, game.possession_side, "home")}
    </div>
    <div class="status-detail">${game.status_detail || ""}${game.down_distance ? " · " + game.down_distance : ""}</div>
    <div class="badges">${badgeHtml(game.badges)}</div>
    <div class="tile-footer">
      <div class="interest-bar-track"><div class="interest-bar-fill" style="width:${Math.min(100, game.interest_score)}%"></div></div>
      <button class="link-btn" data-action="edit-stream">${game.stream_url ? "Edit link" : "Set stream"}</button>
    </div>
  `;
  body.querySelector('[data-action="edit-stream"]').addEventListener("click", (e) => {
    e.stopPropagation();
    openStreamEditor(game.id, game.name, game.stream_url || "");
  });

  tile.appendChild(videoWrap);
  tile.appendChild(body);
  return tile;
}

function pickGridGames(games) {
  const byId = Object.fromEntries(games.map(g => [g.id, g]));
  const used = new Set();
  const slots = pins.map(pinId => {
    if (pinId && byId[pinId]) {
      used.add(pinId);
      return byId[pinId];
    }
    return null;
  });
  const candidates = games.filter(g => !used.has(g.id));
  let ci = 0;
  for (let i = 0; i < GRID_SIZE; i++) {
    if (!slots[i] && ci < candidates.length) {
      slots[i] = candidates[ci++];
      used.add(slots[i].id);
    }
  }
  return slots.filter(Boolean);
}

function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const chosen = pickGridGames(latestGames);
  chosen.forEach(g => grid.appendChild(renderTile(g)));
}

function renderAllGames() {
  const list = document.getElementById("all-games-list");
  list.innerHTML = "";
  latestGames.forEach(g => {
    const row = document.createElement("div");
    row.className = "agame-row";
    const pinnedSlot = pins.findIndex(p => p === g.id);
    const options = ["Auto"].concat([1,2,3,4,5,6].map(n => `Slot ${n}`));
    row.innerHTML = `
      <div class="agame-top">
        <span>${g.away.abbrev} ${g.away.score} @ ${g.home.abbrev} ${g.home.score}</span>
        <span>${g.status_detail || ""}</span>
      </div>
      <div class="badges">${badgeHtml(g.badges)}</div>
      <div class="agame-actions">
        <select class="pin-select">
          ${options.map((o, i) => `<option value="${i - 1}" ${pinnedSlot === i - 1 ? "selected" : ""}>${o}</option>`).join("")}
        </select>
        <button class="link-btn" data-action="edit-stream">${g.stream_url ? "Edit link" : "Set stream"}</button>
      </div>
    `;
    row.querySelector(".pin-select").addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      pins = pins.map(p => (p === g.id ? null : p));
      if (val >= 0) pins[val] = g.id;
      savePins();
      renderGrid();
    });
    row.querySelector('[data-action="edit-stream"]').addEventListener("click", () => {
      openStreamEditor(g.id, g.name, g.stream_url || "");
    });
    list.appendChild(row);
  });
}

// ---------- Modal (pop-up player) ----------
function openModal(game) {
  const backdrop = document.getElementById("modal-backdrop");
  document.getElementById("modal-title").textContent = game.name;
  document.getElementById("modal-scorebug").textContent =
    `${game.away.abbrev} ${game.away.score} — ${game.home.abbrev} ${game.home.score}  ·  ${game.status_detail || ""}`;
  const videoContainer = document.getElementById("modal-video");
  videoContainer.innerHTML = "";
  const embedInfo = getEmbedInfo(game.stream_url, false);
  videoContainer.appendChild(buildVideoEl(embedInfo, false));
  document.getElementById("modal-fallback-link").href = game.stream_url || "#";
  backdrop.classList.remove("hidden");
}
function closeModal() {
  document.getElementById("modal-backdrop").classList.add("hidden");
  document.getElementById("modal-video").innerHTML = "";
}

// ---------- Stream editor ----------
let editingGameId = null;
function openStreamEditor(gameId, name, currentUrl) {
  editingGameId = gameId;
  document.getElementById("stream-edit-title").textContent = "Stream link — " + name;
  document.getElementById("stream-edit-input").value = currentUrl;
  document.getElementById("stream-edit-backdrop").classList.remove("hidden");
}
function closeStreamEditor() {
  document.getElementById("stream-edit-backdrop").classList.add("hidden");
  editingGameId = null;
}
async function saveStreamEdit() {
  const url = document.getElementById("stream-edit-input").value.trim();
  if (!editingGameId) return;
  await fetch("/api/streams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: editingGameId, url }),
  });
  const g = latestGames.find(g => g.id === editingGameId);
  if (g) g.stream_url = url;
  closeStreamEditor();
  renderGrid();
  renderAllGames();
}

// ---------- Polling ----------
async function refresh() {
  try {
    const res = await fetch("/api/games");
    const data = await res.json();
    latestGames = data.games || [];
    document.getElementById("last-updated").textContent =
      "Updated " + new Date(data.last_updated).toLocaleTimeString();
    document.getElementById("error-line").textContent = data.error ? "Backend error: " + data.error : "";
    renderGrid();
    renderAllGames();
  } catch (e) {
    document.getElementById("error-line").textContent = "Can't reach backend.";
  }
}

document.getElementById("all-games-btn").addEventListener("click", () => {
  document.getElementById("all-games-panel").classList.remove("hidden");
});
document.getElementById("close-panel-btn").addEventListener("click", () => {
  document.getElementById("all-games-panel").classList.add("hidden");
});
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target.id === "modal-backdrop") closeModal();
});
document.getElementById("stream-edit-close").addEventListener("click", closeStreamEditor);
document.getElementById("stream-edit-save").addEventListener("click", saveStreamEdit);

refresh();
setInterval(refresh, POLL_MS);
