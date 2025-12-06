console.log("TruckVision Frontend loaded.");

const WORKER_URL = "https://truckvision-api.yoyoastico74.workers.dev/api/state-all";
const PLAYER_KEY = "shogoun-main";

// --- MAP INITIALIZATION ---
const map = L.map("map").setView([52.0, 20.0], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
}).addTo(map);

// --- MARKER ---
let truckMarker = null;

function updateTruckPosition() {
    fetch(WORKER_URL)
        .then(res => res.json())
        .then(players => {
            const me = players.find(p => p.playerKey === PLAYER_KEY);
            if (!me) return;

            const { lat, lon, heading } = me;

            if (!truckMarker) {
                truckMarker = L.marker([lat, lon]).addTo(map);
            } else {
                truckMarker.setLatLng([lat, lon]);
            }

            map.setView([lat, lon]);
        })
        .catch(err => console.error("Erreur update map:", err));
}

setInterval(updateTruckPosition, 500);
