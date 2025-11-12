function editTrip(id) {
  window.location.href = `/explore?edit=${id}`;
}

function shareTrip(id) {
  alert("Share link copied for trip " + id);
}

async function logout() {
  const token = localStorage.getItem("session_token");
  if (!token) return;

  await fetch('/api/logout-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_token: token })
  });

  localStorage.removeItem('session_token');
  localStorage.removeItem('csrf_token');

  updateHeaderUI();
  loadTrips();
}

// ---------- Trips Loading ----------
function loadTrips() {
    const grid = $(".saved-trips-grid");
    const token = localStorage.getItem("session_token");

    if (!token) {
        grid.html(`
        <p style="text-align:center; color:#7a6a5b;">
            Please <a href="/login" style="color:#b77b4b; text-decoration:none;">log in</a> to view your saved trips.
        </p>
        `);
        return;
    }

    fetch("/api/get-trips", {
        headers: { "Authorization": `Bearer ${token}` },
    })
    .then(res => res.json())
    .then(data => {
        if (!data.success) {
            grid.html(`<p style="text-align:center; color:#b65a4a;">${data.error || "Failed to load trips."}</p>`);
            return;
        }

        const trips = data.trips || [];
        if (trips.length === 0) {
            grid.html(`<p style="text-align:center; color:#7a6a5b;">You haven’t saved any trips yet.</p>`);
            return;
        }

        grid.empty();
        trips.forEach(trip => {
            const imageUrl = `/static/images/image${Math.floor(Math.random() * 2) + 1}.jpg`;
            const totalCost = trip.places.reduce((sum, p) => {
            const match = (p.cost || "").match(/\d+(\.\d+)?/);
            return sum + (match ? parseFloat(match[0]) : 0);
            }, 0);
            const firstTime = trip.places[0]?.duration || "—";
            const lastTime = trip.places[trip.places.length - 1]?.duration || "—";

            const card = `
            <div class="trip-card" data-trip-id="${trip._id}">
                <div class="card-image">
                <img src="${imageUrl}" alt="Trip thumbnail" class="card-thumbnail"/>
                <div class="relevance-badge"><span>${"$".repeat(trip.budget)}</span></div>
                </div>
                <div class="card-body">
                <h3 class="card-title">${trip.starting_address || "Unknown Trip"}</h3>
                <p class="card-address">${trip.interests?.join(", ") || "No interests"}</p>
                <p class="card-description">
                    ${trip.places.slice(0, 3).map(p => p.name).join(", ")}${trip.places.length > 3 ? "..." : ""}
                </p>
                </div>
                <div class="card-footer">
                <div class="footer-left">
                    <div class="card-price">~ $${totalCost.toFixed(2)}</div>
                    <div class="card-time">${firstTime} - ${lastTime}</div>
                </div>
                <div class="footer-right">
                    <button class="btn-small" onclick="editTrip('${trip._id}')">Edit</button>
                    <button class="btn-small" onclick="shareTrip('${trip._id}')">Share</button>
                </div>
                </div>
            </div>
            `;
            grid.append(card);
        });
        })
        .catch(err => {
            console.error(err);
            grid.html(`<p style="text-align:center; color:#b65a4a;">Error loading trips.</p>`);
        });
    }

    // ---------- Header UI ----------
    function updateHeaderUI() {
    const token = localStorage.getItem('session_token');
    const headerActions = document.querySelector('.header-actions');

    headerActions.innerHTML = ''; // clear old buttons

    if (token) {
        headerActions.innerHTML = `
        <span>Welcome!</span>
        <button id="guided-setup-btn" class="btn-guided">Guided Setup</button>
        <button id="logout-btn" class="btn-secondary">LOG OUT</button>
        `;

        document.getElementById('logout-btn').addEventListener('click', logout);
    } else {
        headerActions.innerHTML = `
        <button id="guided-setup-btn" class="btn-guided">Guided Setup</button>
        <button class="btn-secondary" onclick="window.location.href='/login';">LOG IN</button>
        <button class="btn-primary" onclick="window.location.href='/register';">SIGN UP</button>
        `;
    }
}

// ---------- Init ----------
$(document).ready(function () {
    updateHeaderUI();
    loadTrips();
});