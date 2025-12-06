// ======================================================
//   TruckVision Frontend - V3 Optimized
//   - Refresh configurable
//   - Compatible Worker V5 (memory only)
//   - Lightweight Cloudflare usage
// ======================================================

// ---------------------------
// CONFIG
// ---------------------------

// ⏱️ Interval d'update de la map (ms)
const REFRESH_PLAYERS_MS = 2000; // 2 secondes

// URLs API Worker
const API_BASE = "https://truckvision-api.yoyoastico74.workers.dev";
const API_STATE_ALL = `${API_BASE}/api/state-all`;
const API_FUEL = `${API_BASE}/api/fuelstations`;

// ---------------------------
// INIT MAP
// ---------------------------

// Style sombre (OpenStreetMap)
const map = L.map("map", {
  zoomSnap: 0.25,
  zoomControl: false,
}).setView([50.8, 10.5], 5.2);

L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
  {
    maxZoom: 19
  }
).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// Layers
const playersLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const citiesLayer = L.layerGroup().addTo(map);
const fuelLayer = L.layerGroup().addTo(map);

// Camion principal (le tien)
let mainTruckMarker = null;

// ---------------------------
// VILLES ETS2 (version light)
// ---------------------------

const ETS2_CITIES = [
  { name: "Berlin", lat: 52.5200, lon: 13.4050 },
  { name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Amsterdam", lat: 52.3676, lon: 4.9041 },
  { name: "Prague", lat: 50.0755, lon: 14.4378 },
  { name: "Brussels", lat: 50.8503, lon: 4.3517 },
  { name: "Luxembourg", lat: 49.6116, lon: 6.1319 },
  { name: "Warsaw", lat: 52.2297, lon: 21.0122 },
  { name: "Vienna", lat: 48.2082, lon: 16.3738 }
];

function drawCities() {
  citiesLayer.clearLayers();
  ETS2_CITIES.forEach(c => {
    L.circleMarker([c.lat, c.lon], {
      radius: 5,
      color: "#f97316",
      fillColor: "#fb923c",
      fillOpacity: 0.9,
    })
    .bindPopup(`<b>${c.name}</b>`)
    .addTo(citiesLayer);
  });
}

// ---------------------------
// STATIONS ESSENCE
// ---------------------------

async function loadFuelStations() {
  try {
    const res = await fetch(API_FUEL);
    const stations = await res.json();

    fuelLayer.clearLayers();

    stations.forEach(s => {
      L.circleMarker([s.lat, s.lon], {
        radius: 7,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 1,
        weight: 2,
      })
      .bindPopup(`<b>Station essence</b><br>${s.name}`)
      .addTo(fuelLayer);
    });
  } catch (err) {
    console.error("Erreur stations:", err);
  }
}

// ---------------------------
// DRAW TRUCK ICON
// ---------------------------

function getTruckIcon(angle) {
  return L.divIcon({
    className: "truck-icon",
    html: `<div style="
      width: 18px;
      height: 18px;
      background: #3b82f6;
      border-radius: 50%;
      border: 2px solid #1e40af;
      transform: rotate(${angle}deg);
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// ---------------------------
// LOAD PLAYERS
// ---------------------------

async function loadPlayers() {
  try {
    const res = await fetch(API_STATE_ALL);
    const players = await res.json();

    playersLayer.clearLayers();
    routeLayer.clearLayers();

    players.forEach(p => {
      if (!p.lat || !p.lon) return;

      // Dessine route (trail)
      if (p.route && Array.isArray(p.route)) {
        const latlngs = p.route.map(pt => [pt.lat, pt.lon]);
        L.polyline(latlngs, {
          color: "#60a5fa",
          weight: 3,
          opacity: 0.7,
        }).addTo(routeLayer);
      }

      // Dessine camion
      const icon = getTruckIcon(p.heading || 0);
      const marker = L.marker([p.lat, p.lon], { icon })
        .bindPopup(`<b>${p.playerKey}</b><br>${p.speedKph.toFixed(1)} km/h`);

      marker.addTo(playersLayer);

      if (p.playerKey === "shogoun-main") {
        updateDashboard(p);
        mainTruckMarker = marker;
      }
    });
  } catch (err) {
    console.error("Erreur loadPlayers:", err);
  }
}

// ---------------------------
// DASHBOARD UI
// ---------------------------

function updateDashboard(p) {
  // Exemples — adaptés à ton interface actuelle
  const speedEl = document.getElementById("speed");
  const gearEl = document.getElementById("gear");
  const rpmEl = document.getElementById("rpm");
  const fuelEl = document.getElementById("fuel");
  const adrEl = document.getElementById("adr");

  if (speedEl) speedEl.textContent = Math.round(p.speedKph) + " km/h";
  if (gearEl) gearEl.textContent = p.truck?.displayedGear || 0;
  if (rpmEl) rpmEl.textContent = Math.round(p.truck?.engineRpm || 0) + " rpm";

  if (fuelEl) {
    const f = p.truck?.fuel || 0;
    const cap = p.truck?.fuelCapacity || 1;
    const pct = Math.round((f / cap) * 100);
    fuelEl.textContent = `${pct}%`;
  }

  // ADR detection simple
  const cargo = p.job?.cargo?.toLowerCase() || "";
  let adrClass = "N/A";

  if (cargo.includes("acid") || cargo.includes("acide")) adrClass = "8";
  else if (cargo.includes("fuel") || cargo.includes("essence")) adrClass = "3";
  else if (cargo.includes("gas") || cargo.includes("gaz")) adrClass = "2";

  if (adrEl) adrEl.textContent = adrClass;
}

// ---------------------------
// STARTUP
// ---------------------------

drawCities();
loadFuelStations();
loadPlayers();

setInterval(loadPlayers, REFRESH_PLAYERS_MS);
