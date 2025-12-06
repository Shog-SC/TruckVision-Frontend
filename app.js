// TruckVision V6 - Auto Center + ETS2 Routes Ready
// ------------------------------------------------
// - Carte dark centrée Europe ETS2
// - Villes, stations, camions, routes (heatmap)
// - Dashboard ADR + moteur + session + radar
// - Auto Center ON/OFF (bouton)
// - Couche pour routes ETS2 officielles (GeoJSON externe)

// ================== CONFIG ==================
const WORKER_BASE_URL    = "https://truckvision-api.yoyoastico74.workers.dev";
const ME_PLAYER_KEY      = "shogoun-main";
const ACCESS_KEY         = "";       // Optionnel, ex: "TV-SECRET"
const REFRESH_PLAYERS_MS = 2000;     // Refresh des joueurs (ms)
const ETS2_ROADS_URL     = "ets2-roads.geojson"; // GeoJSON des routes ETS2 (option 3)

// ================== SÉCURITÉ SIMPLE ==================
if (ACCESS_KEY && typeof window !== "undefined") {
  const url = new URL(window.location.href);
  const k   = url.searchParams.get("k");
  if (k !== ACCESS_KEY) {
    document.body.innerHTML = `
      <div style='display:flex;align-items:center;justify-content:center;
                  height:100vh;background:#020617;color:#f9fafb;font-family:system-ui'>
          Accès TruckVision protégé.<br/>Ajoute ?k=TON_SECRET à l'URL.
      </div>`;
    throw new Error("Accès refusé (clé incorrecte).");
  }
}

const STATE_ALL_URL = `${WORKER_BASE_URL}/api/state-all`;
const FUEL_URL      = `${WORKER_BASE_URL}/api/fuelstations`;

// ================== BORNES CARTE (Europe ETS2) ==================
const EUROPE_BOUNDS = L.latLngBounds(
  L.latLng(30.0, -15.0),
  L.latLng(72.0, 40.0)
);

// ================== INIT CARTE ==================
const map = L.map("map", {
  zoomControl: true,
  maxBounds: EUROPE_BOUNDS,
  maxBoundsViscosity: 0.8
}).setView([52.0, 10.0], 5);

// Fond de carte DARK (nuit)
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap &copy; CARTO',
}).addTo(map);

// Layers
const trucksLayer = L.layerGroup().addTo(map);
const routeLayer  = L.layerGroup().addTo(map);   // routes joueurs (heatmap)
const fuelLayer   = L.layerGroup().addTo(map);
const citiesLayer = L.layerGroup().addTo(map);
const ets2RoadsLayer = L.layerGroup().addTo(map); // routes ETS2 officielles (option 3)

let myRoutePolyline = null;

// Auto-center
let autoCenterEnabled = true;
let hasInitialCentered = false;

// ================== ICONES ==================
const myTruckIcon = L.divIcon({
  className: "tv-truck-icon tv-truck-me",
  html: "🚛",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

const otherTruckIcon = L.divIcon({
  className: "tv-truck-icon tv-truck-other",
  html: "🚚",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ================== VILLES ETS2 (extraits) ==================
const ETS2_CITIES = [
  { name: "Berlin",     lat: 52.5200, lon: 13.4050 },
  { name: "Hamburg",    lat: 53.5511, lon: 9.9937 },
  { name: "Paris",      lat: 48.8566, lon: 2.3522 },
  { name: "Amsterdam",  lat: 52.3676, lon: 4.9041 },
  { name: "Bruxelles",  lat: 50.8503, lon: 4.3517 },
  { name: "Luxembourg", lat: 49.6116, lon: 6.1319 },
  { name: "Prague",     lat: 50.0755, lon: 14.4378 },
  { name: "Vienne",     lat: 48.2082, lon: 16.3738 },
  { name: "Varsovie",   lat: 52.2297, lon: 21.0122 },
  { name: "Milan",      lat: 45.4642, lon: 9.1900 }
];

function drawCities() {
  citiesLayer.clearLayers();
  ETS2_CITIES.forEach(city => {
    const m = L.circleMarker([city.lat, city.lon], {
      radius: 4,
      color: "#f97316",
      fillColor: "#f97316",
      fillOpacity: 1,
      weight: 2
    }).addTo(citiesLayer);
    m.bindPopup(`<b>${city.name}</b>`);
  });
}

// ================== STATIONS ESSENCE ==================
async function loadFuelStations() {
  try {
    const res = await fetch(FUEL_URL);
    if (!res.ok) return;

    const stations = await res.json();
    fuelLayer.clearLayers();

    stations.forEach((s) => {
      if (typeof s.lat !== "number") return;
      const mk = L.circleMarker([s.lat, s.lon], {
        radius: 7,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 1,
        weight: 2,
      })
      .bindPopup(`<b>Station essence</b><br>${s.name || ""}`)
      .addTo(fuelLayer);
      mk.bringToFront();
    });
  } catch (e) {
    console.error("Erreur loadFuelStations()", e);
  }
}

// ================== ROUTES ETS2 OFFICIELLES (Option 3) ==================
// Attendu : fichier ets2-roads.geojson dans le repo (GeoJSON de lignes)
async function loadEts2Roads() {
  try {
    const res = await fetch(ETS2_ROADS_URL);
    if (!res.ok) {
      console.warn("Impossible de charger ets2-roads.geojson (pas encore présent ?)");
      return;
    }
    const geo = await res.json();
    ets2RoadsLayer.clearLayers();

    L.geoJSON(geo, {
      style: function () {
        return {
          color: "#22c55e",   // vert vif
          weight: 4,
          opacity: 0.95
        };
      }
    }).addTo(ets2RoadsLayer);
  } catch (e) {
    console.error("Erreur loadEts2Roads()", e);
  }
}

// ================== ADR DETECTION (simple) ==================
function getAdrInfo(cargoName) {
  if (!cargoName || typeof cargoName !== "string") {
    return { adrClass: null, label: "Non ADR / Inconnu", color: "#9ca3af" };
  }
  const c = cargoName.toLowerCase();

  if (c.includes("explos") || c.includes("dynamite") || c.includes("nitro")) {
    return { adrClass: 1, label: "Explosifs", color: "#ef4444" };
  }
  if (c.includes("gaz") || c.includes("gas") || c.includes("propane") || c.includes("butane") || c.includes("lpg")) {
    return { adrClass: 2, label: "Gaz", color: "#f97316" };
  }
  if (c.includes("fuel") || c.includes("diesel") || c.includes("essence") ||
      c.includes("petrol") || c.includes("ethanol") || c.includes("oil")) {
    return { adrClass: 3, label: "Liquides inflammables", color: "#facc15" };
  }
  if (c.includes("oxid") || c.includes("peroxide") || c.includes("nitrate")) {
    return { adrClass: 5, label: "Comburants / peroxydes", color: "#22c55e" };
  }
  if (c.includes("toxic") || c.includes("poison") || c.includes("pestic") || c.includes("chlore") || c.includes("chlorine")) {
    return { adrClass: 6, label: "Toxiques", color: "#a855f7" };
  }
  if (c.includes("radio") || c.includes("uran") || c.includes("radium")) {
    return { adrClass: 7, label: "Radioactifs", color: "#6366f1" };
  }
  if (c.includes("corros") || c.includes("acid") || c.includes("acide") || c.includes("soude")) {
    return { adrClass: 8, label: "Corrosifs", color: "#06b6d4" };
  }
  return { adrClass: null, label: "Non ADR détecté", color: "#9ca3af" };
}

// ================== UTILS ==================
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatEtaFromSeconds(sec) {
  if (!sec || sec <= 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

// ================== STATS DE SESSION ==================
let sessionStartTime = Date.now();
let lastMeLat = null;
let lastMeLon = null;
let sessionDistanceKm = 0;
let sessionFuelStart = null;

// ================== JOUEURS ==================
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
    if (!p.lat || !p.lon) return;

    const isMe = p.playerKey === ME_PLAYER_KEY;
    const icon = isMe ? myTruckIcon : otherTruckIcon;
    const heading = typeof p.heading === "number" ? p.heading : 0;

    // Marker camion
    const marker = L.marker([p.lat, p.lon], {
      icon,
      rotationAngle: heading,
      rotationOrigin: "center center",
    });

    const speed = p.speedKph ? Math.round(p.speedKph) : 0;
    const job = p.job || {};
    const cargo = job.cargo || "Aucun job";
    const mass = job.mass ? `${job.mass} kg` : "";
    const from = job.sourceCity || "?";
    const to   = job.destinationCity || "?";

    marker.bindPopup(
      `<b>${p.playerKey || "Joueur"}</b><br>` +
      `Vitesse : ${speed} km/h<br>` +
      `${cargo} ${mass}<br>` +
      `De : ${from}<br>` +
      `Vers : ${to}`
    );

    marker.addTo(trucksLayer);

    // Heatmap simple : routes de tous les joueurs
    if (Array.isArray(p.route) && p.route.length > 1) {
      const latlngs = p.route
        .filter((pt) => typeof pt.lat === "number" && typeof pt.lon === "number")
        .map((pt) => [pt.lat, pt.lon]);
      if (latlngs.length > 1) {
        L.polyline(latlngs, {
          color: isMe ? "#38bdf8" : "rgba(148,163,184,0.6)",
          weight: isMe ? 3 : 2,
          opacity: isMe ? 0.95 : 0.4,
        }).addTo(routeLayer);
      }
    }

    if (isMe) {
      me = p;

      // Initial auto center uniquement une fois
      if (!hasInitialCentered) {
        map.setView([p.lat, p.lon], 7);
        hasInitialCentered = true;
      } else if (autoCenterEnabled) {
        // Auto center actif : on suit le camion, mais on respecte le zoom
        map.panTo([p.lat, p.lon]);
      }
    }
  });

  // Distance de session pour "me"
  if (me && typeof me.lat === "number" && typeof me.lon === "number") {
    if (lastMeLat !== null && lastMeLon !== null) {
      const d = haversineKm(lastMeLat, lastMeLon, me.lat, me.lon);
      if (d < 50) {
        sessionDistanceKm += d;
      }
    }
    lastMeLat = me.lat;
    lastMeLon = me.lon;
  }
}

// ================== SIDEBAR / DASHBOARD ==================
function updateSidebar(players) {
  const meStats    = document.getElementById("tv-me-stats");
  const playersDiv = document.getElementById("tv-players");

  const me = players.find((p) => p.playerKey === ME_PLAYER_KEY);

  const now = Date.now();
  const sessionDurationMs = now - sessionStartTime;

  let radarLines = [];

  if (me) {
    const speed = me.speedKph ? Math.round(me.speedKph) : 0;
    const job   = me.job || {};
    const cargo = job.cargo || "Aucun job";
    const mass  = job.mass ? `${job.mass} kg` : "—";
    const from  = job.sourceCity || "?";
    const to    = job.destinationCity || "?";

    const adr    = getAdrInfo(cargo);
    const truck  = me.truck || {};
    const rpm    = Math.round(truck.engineRpm || 0);
    const gear   = truck.displayedGear ?? truck.gear ?? 0;
    const fuel   = truck.fuel || 0;
    const fuelCap= truck.fuelCapacity || 0;
    const fuelPct= fuelCap > 0 ? Math.round((fuel / fuelCap) * 100) : null;
    const dmgEng = Math.round((truck.damageEngine || 0) * 100);
    const dmgTrn = Math.round((truck.damageTransmission || 0) * 100);
    const cruise = !!truck.cruiseControlOn;
    const cruiseSpeed = truck.cruiseControlSpeed ? Math.round(truck.cruiseControlSpeed * 3.6) : 0;
    const nav   = me.navigation || {};
    const etaStr= nav.estimatedTime ? formatEtaFromSeconds(nav.estimatedTime) : "—";

    // Stats session fuel
    if (sessionFuelStart === null && fuel > 0) {
      sessionFuelStart = fuel;
    }
    let fuelUsed = null;
    let fuelPer100 = null;
    if (sessionFuelStart !== null && fuelCap > 0 && sessionDistanceKm > 0) {
      fuelUsed = Math.max(0, sessionFuelStart - fuel);
      fuelPer100 = (fuelUsed / sessionDistanceKm) * 100;
    }

    // Radar simple : joueurs <= 5 km
    const nearby = players
      .filter(p => p.playerKey !== ME_PLAYER_KEY && p.lat && p.lon)
      .map(p => {
        const dist = haversineKm(me.lat, me.lon, p.lat, p.lon);
        return { playerKey: p.playerKey, distanceKm: dist, speedKph: Math.round(p.speedKph || 0) };
      })
      .filter(x => x.distanceKm <= 5)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    radarLines = nearby.map(n => `• ${n.playerKey} – ${n.distanceKm.toFixed(2)} km (${n.speedKph} km/h)`);

    meStats.innerHTML = `
      <div class="tv-section-title">Mon camion</div>
      <div class="tv-stat"><b>PlayerKey :</b> ${ME_PLAYER_KEY}</div>
      <div class="tv-stat"><b>Vitesse :</b> ${speed} km/h</div>
      <div class="tv-stat"><b>Cargo :</b> ${cargo} (${mass})</div>
      <div class="tv-stat"><b>Trajet :</b> ${from} ➜ ${to}</div>

      <div class="tv-section-title">ADR</div>
      <div class="tv-stat">
        <b>Classe :</b> 
        <span style="color:${adr.color};font-weight:600;">
          ${adr.adrClass ? `ADR ${adr.adrClass} – ${adr.label}` : adr.label}
        </span>
      </div>

      <div class="tv-section-title">Moteur / Boîte</div>
      <div class="tv-stat"><b>Régime :</b> ${rpm} rpm</div>
      <div class="tv-stat"><b>Rapport :</b> ${gear}</div>

      <div class="tv-section-title">Carburant</div>
      <div class="tv-stat">
        <b>Niveau :</b> ${fuelPct !== null ? fuelPct + '%' : 'N/A'} 
        ${truck.fuelWarningOn ? "<span style='color:#ef4444;font-weight:600;'>LOW FUEL</span>" : ""}
      </div>

      <div class="tv-section-title">Dégâts</div>
      <div class="tv-stat"><b>Moteur :</b> ${dmgEng}%</div>
      <div class="tv-stat"><b>Transmission :</b> ${dmgTrn}%</div>

      <div class="tv-section-title">Régulateur</div>
      <div class="tv-stat">
        <b>État :</b> ${cruise ? "<span style='color:#22c55e;'>ON</span>" : "OFF"} 
        ${cruise && cruiseSpeed ? `(${cruiseSpeed} km/h)` : ""}
      </div>

      <div class="tv-section-title">Navigation</div>
      <div class="tv-stat"><b>ETA estimé :</b> ${etaStr}</div>

      <div class="tv-section-title">Session</div>
      <div class="tv-stat"><b>Durée :</b> ${formatDuration(sessionDurationMs)}</div>
      <div class="tv-stat"><b>Distance :</b> ${sessionDistanceKm.toFixed(1)} km</div>
      <div class="tv-stat"><b>Conso :</b> ${fuelPer100 ? fuelPer100.toFixed(1) + " L/100km" : "—"}</div>

      <div class="tv-section-title">Radar (≤5 km)</div>
      <div class="tv-stat">
        ${radarLines.length === 0 ? "Aucun joueur proche." : radarLines.join("<br>")}
      </div>
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
    const isMe  = p.playerKey === ME_PLAYER_KEY;

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

// ================== UI : Auto Center Toggle ==================
function initAutoCenterToggle() {
  const btn = document.getElementById("tv-autocenter-toggle");
  if (!btn) return;

  const refreshLabel = () => {
    btn.textContent = autoCenterEnabled ? "Auto Center: ON" : "Auto Center: OFF";
  };

  btn.addEventListener("click", () => {
    autoCenterEnabled = !autoCenterEnabled;
    refreshLabel();
  });

  refreshLabel();
}

// ================== START ==================
drawCities();
loadFuelStations();
loadEts2Roads();
loadPlayers();

// Refresh joueurs
setInterval(loadPlayers, REFRESH_PLAYERS_MS);

// Init UI quand DOM prêt
document.addEventListener("DOMContentLoaded", () => {
  initAutoCenterToggle();
});

