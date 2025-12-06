// TruckVision V3 - app.js
// -----------------------
// - Carte limitée à l'Europe (zone ETS2)
// - Icônes camions (toi + autres joueurs)
// - Trace récente de ton trajet
// - Stations essence depuis le Worker
// - Marqueurs de villes ETS2 (base + quelques DLC)
// - Sidebar avec infos camion + liste joueurs

// ⚙️ CONFIG À ADAPTER SI BESOIN
const WORKER_BASE_URL = "https://truckvision-api.yoyoastico74.workers.dev";
const ME_PLAYER_KEY   = "shogoun-main";

// Option access "pseudo privé" : si ACCESS_KEY != ""
// alors il faut ajouter ?k=SECRET dans l'URL de la map
const ACCESS_KEY = ""; // ex: "TRUCKVISION-SECRET"

// ================== SÉCURITÉ LÉGÈRE ==================
if (ACCESS_KEY && typeof window !== "undefined") {
  const url = new URL(window.location.href);
  const k   = url.searchParams.get("k");
  if (k !== ACCESS_KEY) {
    document.body.innerHTML = "<div style='display:flex;align-items:center;justify-content:center;height:100vh;background:#020617;color:#f9fafb;font-family:system-ui'>Accès TruckVision protégé.<br/>Ajoute le paramètre ?k=TON_SECRET à l'URL.</div>";
    throw new Error("Accès refusé (clé incorrecte).");
  }
}

// ================== URL API ==================
const STATE_ALL_URL = `${WORKER_BASE_URL}/api/state-all`;
const FUEL_URL      = `${WORKER_BASE_URL}/api/fuelstations`;

// ================== BORNES DE LA CARTE (EUROPE ETS2) ==================
// On limite la carte grossièrement à l'Europe jouable d'ETS2 (base + DLC courants)
const EUROPE_BOUNDS = L.latLngBounds(
  L.latLng(30.0, -15.0), // SW
  L.latLng(72.0, 40.0)   // NE
);

// ================== INITIALISATION DE LA CARTE ==================
const map = L.map("map", {
  zoomControl: true,
  maxBounds: EUROPE_BOUNDS,
  maxBoundsViscosity: 0.8
}).setView([52.0, 10.0], 5);

// Fond sombre type "night driving"
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap &copy; CARTO',
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

// ================== VILLES ETS2 (EXEMPLE BASE + QUELQUES DLC) ==================
// ⚠️ Coordonnées approximatives sur le globe (pas la mini-map SCS exacte, mais cohérentes pour la vue générale)
const ETS2_CITIES = [
  // Base game
  { name: "Calais",       lat: 50.951, lon: 1.858 },
  { name: "Paris",        lat: 48.8566, lon: 2.3522 },
  { name: "Lille",        lat: 50.6292, lon: 3.0573 },
  { name: "Lyon",         lat: 45.7640, lon: 4.8357 },
  { name: "Marseille",    lat: 43.2965, lon: 5.3698 },
  { name: "Bordeaux",     lat: 44.8378, lon: -0.5792 },
  { name: "London",       lat: 51.5074, lon: -0.1278 },
  { name: "Manchester",   lat: 53.4808, lon: -2.2426 },
  { name: "Berlin",       lat: 52.5200, lon: 13.4050 },
  { name: "Hamburg",      lat: 53.5511, lon: 9.9937 },
  { name: "Frankfurt",    lat: 50.1109, lon: 8.6821 },
  { name: "Munich",       lat: 48.1351, lon: 11.5820 },
  { name: "Wien (Vienna)",lat: 48.2082, lon: 16.3738 },
  { name: "Milano",       lat: 45.4642, lon: 9.1900 },
  { name: "Roma",         lat: 41.9028, lon: 12.4964 },
  { name: "Madrid",       lat: 40.4168, lon: -3.7038 },
  { name: "Barcelona",    lat: 41.3851, lon: 2.1734 },
  { name: "Praha",        lat: 50.0755, lon: 14.4378 },
  { name: "Bratislava",   lat: 48.1486, lon: 17.1077 },
  { name: "Budapest",     lat: 47.4979, lon: 19.0402 },
  { name: "Warszawa",     lat: 52.2297, lon: 21.0122 },
  { name: "Poznan",       lat: 52.4064, lon: 16.9252 },
  { name: "Gdansk",       lat: 54.3520, lon: 18.6466 },
  { name: "Szczecin",     lat: 53.4285, lon: 14.5528 },
  // DLC Scandinavia (exemples)
  { name: "København",    lat: 55.6761, lon: 12.5683 },
  { name: "Oslo",         lat: 59.9139, lon: 10.7522 },
  { name: "Stockholm",    lat: 59.3293, lon: 18.0686 },
  { name: "Göteborg",     lat: 57.7089, lon: 11.9746 },
  // DLC Going East + Baltic + Balkans (exemples)
  { name: "Cluj-Napoca",  lat: 46.7712, lon: 23.6236 },
  { name: "Sofia",        lat: 42.6977, lon: 23.3219 },
  { name: "Istanbul",     lat: 41.0082, lon: 28.9784 },
  { name: "Riga",         lat: 56.9496, lon: 24.1052 },
  { name: "Tallinn",      lat: 59.4370, lon: 24.7536 },
  { name: "Vilnius",      lat: 54.6872, lon: 25.2797 },
];

function drawCities() {
  citiesLayer.clearLayers();
  ETS2_CITIES.forEach(city => {
    const marker = L.circleMarker([city.lat, city.lon], {
      radius: 4,
      color: "#f97316",
      fillColor: "#f97316",
      fillOpacity: 0.9,
    }).addTo(citiesLayer);
    marker.bindPopup(`<b>${city.name}</b>`);
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

// ================== LECTURE DES JOUEURS ==================
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
    // Certains SDK renvoient déjà en degrés, d'autres en radians → on reste "visuel"
    const headingDeg = heading; 

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
    const to   = job.destinationCity || "?";

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

  // Route pour le joueur local (historique V2)
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

// ================== SIDEBAR ==================
function updateSidebar(players) {
  const meStats   = document.getElementById("tv-me-stats");
  const playersDiv= document.getElementById("tv-players");

  const me = players.find((p) => p.playerKey === ME_PLAYER_KEY);

  if (me) {
    const speed = me.speedKph ? Math.round(me.speedKph) : 0;
    const job   = me.job || {};
    const cargo = job.cargo || "Aucun job";
    const mass  = job.mass ? `${job.mass} kg` : "—";
    const from  = job.sourceCity || "?";
    const to    = job.destinationCity || "?";

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

// ================== LANCEMENT ==================
drawCities();
loadFuelStations();
loadPlayers();

setInterval(loadPlayers, 1000);
