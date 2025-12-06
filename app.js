// À personnaliser :
const WORKER_BASE_URL = "https://truckvision-api.yoyoastico74.workers.dev";
const ME_PLAYER_KEY = "shogoun-main";

const STATE_ALL_URL = `${WORKER_BASE_URL}/api/state-all`;
const FUEL_URL = `${WORKER_BASE_URL}/api/fuelstations`;

// --- INITIALISATION DE LA CARTE ---
const map = L.map("map", {
  zoomControl: true,
}).setView([50.746475, 10.508655], 5);

// Fond de carte sombre type "night driving"
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap &copy; CARTO',
}).addTo(map);

// Couches
const trucksLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const fuelLayer = L.layerGroup().addTo(map);

let myRoutePolyline = null;

// --- ICONES ---
const myTruckIcon = L.divIcon({
  className: "tv-truck-icon tv-truck-me",
  html: "🚛",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const otherTruckIcon = L.divIcon({
  className: "tv-truck-icon tv-truck-other",
  html: "🚚",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// --- FUEL STATIONS ---
async function loadFuelStations() {
  try {
    const res = await fetch(FUEL_URL);
    if (!res.ok) return;
    const stations = await res.json();

    fuelLayer.clearLayers();
    stations.forEach((s) => {
      if (typeof s.lat !== "number" || typeof s.lon !== "number") return;
      L.circleMarker([s.lat, s.lon], {
        radius: 4,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 0.9,
      })
        .bindPopup(`<b>Station</b><br>${s.name || "Station essence"}`)
        .addTo(fuelLayer);
    });
  } catch (e) {
    console.error("Erreur loadFuelStations()", e);
  }
}

// --- MISE À JOUR DES JOUEURS + ROUTE ---
async function loadPlayers() {
  try {
    const res = await fetch(STATE_ALL_URL);
    if (!res.ok) return;
    const players = await res.json();

    updatePlayersOnMap(players);
    updateSidebar(players);
  } catch (e) {
    console.error("Erreur loadPlayers()", e);
  }
}

function updatePlayersOnMap(players) {
  trucksLayer.clearLayers();
  routeLayer.clearLayers();
  myRoutePolyline = null;

  let me = null;

  players.forEach((p) => {
    if (typeof p.lat !== "number" || typeof p.lon !== "number") return;

    const isMe = p.playerKey === ME_PLAYER_KEY;
    const icon = isMe ? myTruckIcon : otherTruckIcon;

    const heading = typeof p.heading === "number" ? p.heading : 0;
    const headingDeg = heading * (180 / Math.PI); // heading ≈ radians

    const marker = L.marker([p.lat, p.lon], {
      icon,
      rotationAngle: headingDeg,
      rotationOrigin: "center center",
    });

    const speed = p.speedKph ? Math.round(p.speedKph) : 0;
    const job = p.job || {};
    const cargo = job.cargo || "Aucun job";
    const mass = job.mass ? `${job.mass} kg` : "";
    const from = job.sourceCity || "?";
    const to = job.destinationCity || "?";

    marker.bindPopup(
      `<b>${p.playerKey || "Joueur"}</b><br>` +
        `Vitesse : ${speed} km/h<br>` +
        `${cargo} ${mass}<br>` +
        `De : ${from}<br>` +
        `Vers : ${to}`
    );

    marker.addTo(trucksLayer);

    if (isMe) {
      me = p;
      map.setView([p.lat, p.lon], 7);
    }
  });

  // Route pour le joueur local (historique)
  if (me && Array.isArray(me.route) && me.route.length > 1) {
    const latlngs = me.route
      .filter((pt) => typeof pt.lat === "number" && typeof pt.lon === "number")
      .map((pt) => [pt.lat, pt.lon]);

    if (latlngs.length > 1) {
      myRoutePolyline = L.polyline(latlngs, {
        color: "#38bdf8",
        weight: 3,
        opacity: 0.9,
      }).addTo(routeLayer);
    }
  }
}

// --- SIDEBAR ---
function updateSidebar(players) {
  const meStats = document.getElementById("tv-me-stats");
  const playersDiv = document.getElementById("tv-players");

  const me = players.find((p) => p.playerKey === ME_PLAYER_KEY);

  if (me) {
    const speed = me.speedKph ? Math.round(me.speedKph) : 0;
    const job = me.job || {};
    const cargo = job.cargo || "Aucun job";
    const mass = job.mass ? `${job.mass} kg` : "—";
    const from = job.sourceCity || "?";
    const to = job.destinationCity || "?";

    meStats.innerHTML = `
      <div class="tv-section-title">Mon camion</div>
      <div class="tv-stat"><b>PlayerKey :</b> ${ME_PLAYER_KEY}</div>
      <div class="tv-stat"><b>Vitesse :</b> ${speed} km/h</div>
      <div class="tv-stat"><b>Cargo :</b> ${cargo} (${mass})</div>
      <div class="tv-stat"><b>Trajet :</b> ${from} ➜ ${to}</div>
    `;
  } else {
    meStats.innerHTML = `
      <div class="tv-section-title">Mon camion</div>
      <div class="tv-stat">En attente de données pour <b>${ME_PLAYER_KEY}</b>…</div>
    `;
  }

  // Liste des joueurs
  playersDiv.innerHTML = "";
  const sorted = [...players].sort((a, b) => {
    if (a.playerKey === ME_PLAYER_KEY) return -1;
    if (b.playerKey === ME_PLAYER_KEY) return 1;
    return (a.playerKey || "").localeCompare(b.playerKey || "");
  });

  sorted.forEach((p) => {
    const speed = p.speedKph ? Math.round(p.speedKph) : 0;
    const isMe = p.playerKey === ME_PLAYER_KEY;

    const row = document.createElement("div");
    row.className = "tv-player-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "tv-player-name" + (isMe ? " tv-player-me" : "");
    nameSpan.textContent = p.playerKey || "Joueur";

    const badge = document.createElement("span");
    badge.className = "tv-badge" + (isMe ? " me" : "");
    badge.textContent = isMe ? "MOI" : "EN LIGNE";

    const left = document.createElement("div");
    left.appendChild(nameSpan);
    left.appendChild(badge);

    const speedSpan = document.createElement("span");
    speedSpan.className = "tv-player-speed";
    speedSpan.textContent = `${speed} km/h`;

    row.appendChild(left);
    row.appendChild(speedSpan);

    playersDiv.appendChild(row);
  });
}

// --- BOUCLES DE RAFRAÎCHISSEMENT ---
loadFuelStations();
loadPlayers();

setInterval(loadPlayers, 1000);
