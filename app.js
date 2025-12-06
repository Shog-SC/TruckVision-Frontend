/* ===========================
    TRUCKVISION V3 - APP.JS  
   =========================== */

// ⚙️ CONFIG
const WORKER_BASE_URL = "https://truckvision-api.yoyoastico74.workers.dev";
const ME_PLAYER_KEY   = "shogoun-main";

// Option sécurisation simple (?k=SECRET dans l’URL)
const ACCESS_KEY = ""; // ex: "TV-SECRET"

// ================== SÉCURITÉ LÉGÈRE ==================
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

// ================== URL API ==================
const STATE_ALL_URL = `${WORKER_BASE_URL}/api/state-all`;
const FUEL_URL      = `${WORKER_BASE_URL}/api/fuelstations`;

// ================== BORNES DE LA CARTE ==================
const EUROPE_BOUNDS = L.latLngBounds(
  L.latLng(30.0, -15.0),
  L.latLng(72.0, 40.0)
);

// ================== INITIALISATION CARTE ==================
const map = L.map("map", {
  zoomControl: true,
  maxBounds: EUROPE_BOUNDS,
  maxBoundsViscosity: 0.8
}).setView([52.0, 10.0], 5);

// Fond sombre stylé
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
  maxZoom: 19,
}).addTo(map);

// Layers
const trucksLayer = L.layerGroup().addTo(map);
const routeLayer  = L.layerGroup().addTo(map);
const fuelLayer   = L.layerGroup().addTo(map);
const citiesLayer = L.layerGroup().addTo(map);

let myRoutePolyline = null;

// ================== ICONES CAMIONS ==================
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
  { name: "Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Lyon", lat: 45.7640, lon: 4.8357 },
  { name: "Marseille", lat: 43.2965, lon: 5.3698 },
  { name: "Berlin", lat: 52.5200, lon: 13.4050 },
  { name: "Hamburg", lat: 53.5511, lon: 9.9937 },
  { name: "Frankfurt", lat: 50.1109, lon: 8.6821 },
  { name: "Roma", lat: 41.9028, lon: 12.4964 },
  { name: "Milano", lat: 45.4642, lon: 9.1900 },
  { name: "Budapest", lat: 47.4979, lon: 19.0402 },
  { name: "Praha", lat: 50.0755, lon: 14.4378 },
  { name: "Bratislava", lat: 48.1486, lon: 17.1077 },
  { name: "Warszawa", lat: 52.2297, lon: 21.0122 },
  { name: "Oslo", lat: 59.9139, lon: 10.7522 },
  { name: "Stockholm", lat: 59.3293, lon: 18.0686 },
  { name: "Göteborg", lat: 57.7089, lon: 11.9746 },
  { name: "Istanbul", lat: 41.0082, lon: 28.9784 }
];

// Affichage villes
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

// ================== STATIONS ESSENCE (FIXED) ==================
async function loadFuelStations() {
  try {
    console.log("Chargement stations…");
    const res = await fetch(FUEL_URL);
    if (!res.ok) return console.error("Fuel error", res.status);

    const stations = await res.json();
    console.log("Stations :", stations);

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
  } catch (err) {
    console.error("Erreur stations :", err);
  }
}

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

    const marker = L.marker([p.lat, p.lon], {
      icon,
      rotationAngle: p.heading || 0,
      rotationOrigin: "center center"
    });

    marker.addTo(trucksLayer);

    if (isMe) {
      me = p;
      map.setView([p.lat, p.lon], 7);
    }
  });

  // Route personnelle
  if (me && me.route && me.route.length > 1) {
    const pts = me.route.map(pt => [pt.lat, pt.lon]);
    myRoutePolyline = L.polyline(pts, {
      color: "#38bdf8",
      weight: 3,
      opacity: 0.9
    }).addTo(routeLayer);
  }
}

// ================== SIDEBAR ==================
function updateSidebar(players) {
  const meStats = document.getElementById("tv-me-stats");
  const lst     = document.getElementById("tv-players");

  const me = players.find(p => p.playerKey === ME_PLAYER_KEY);

  if (me) {
    meStats.innerHTML = `
      <div class="tv-section-title">Mon camion</div>
      <div class="tv-stat"><b>PlayerKey :</b> ${ME_PLAYER_KEY}</div>
      <div class="tv-stat"><b>Vitesse :</b> ${Math.round(me.speedKph || 0)} km/h</div>
      <div class="tv-stat"><b>Cargo :</b> ${(me.job?.cargo || "Aucun job")}</div>
    `;
  } else {
    meStats.innerHTML = "En attente de données…";
  }

  lst.innerHTML = "";
  players.forEach(p => {
    lst.innerHTML += `
      <div class="tv-player-row">
        <span><b>${p.playerKey}</b></span>
        <span>${Math.round(p.speedKph || 0)} km/h</span>
      </div>`;
  });
}

// ================== START ==================
drawCities();
loadFuelStations();
loadPlayers();
setInterval(loadPlayers, 1000);
