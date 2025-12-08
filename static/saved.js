function editTrip(id) {
    window.location.href = `/explore?edit=${id}`;
}

async function downloadPDF(tripId) {
    const pdfUrl = `/share-trip/pdf/${tripId}`;

    try {
        const response = await fetch(pdfUrl, {
            method: "GET",
            credentials: "include"
        });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `itinerary-${tripId}.pdf`;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 200);
    } catch (err) {
        console.error("PDF download failed:", err);
    }
}

function shareTrip(id) {
    // 1. Auto-download the PDF
    downloadPDF(id);

    // 2. Prepare mailto link
    const subject = encodeURIComponent("Your Trip Itinerary");
    const body = encodeURIComponent(
        `Hi,\n\nYour itinerary PDF has been downloaded.\nPlease attach it to this email.\n\nDownload link as backup:\n${window.location.origin}/share-trip/pdf/${id}\n\nBest regards!`
    );

    // 3. Open email client
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

async function logout() {
    try {
        const res = await fetch('/api/logout-user', {
            method: 'POST',
            credentials: 'include', // Cookies sent automatically
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': getCookie('csrf_token') || '' // Only for CSRF
            }
        });
        
        // Redirect regardless of response
        window.location.href = '/login';
    } catch (err) {
        console.error('Error during logout:', err);
        window.location.href = '/login'; // Still redirect
    }
}

// ---------- Check Login ----------
async function checkLogin() {
    try {
        const res = await fetch('/current-user', {
            credentials: 'include' // Cookies sent automatically
        });
        
        if (!res.ok) return null;
        
        const data = await res.json();
        return data.logged_in ? data.user : null;
    } catch (err) {
        console.error("Error checking login:", err);
        return null;
    }
}

// ---------- Trips Loading ----------
async function loadTrips() {
    const grid = $(".saved-trips-grid");
    const user = await checkLogin();

    if (!user) {
        grid.html(`
            <p style="text-align:center; color:#7a6a5b;">
                Please <a href="/login" style="color:#b77b4b; text-decoration:none;">log in</a> to view your saved trips.
            </p>
        `);
        return;
    }

    try {
        const res = await fetch("/api/get-trips", {
            credentials: "include", // Cookies sent automatically
            headers: {
                "X-CSRF-Token": getCookie("csrf_token") || '' // Only for CSRF check
            }
        });
        
        if (res.status === 401) {
            grid.html(`
                <p style="text-align:center; color:#b65a4a;">
                    Session expired. Please <a href="/login" style="color:#b77b4b;">log in</a> again.
                </p>
            `);
            return;
        }
        
        const data = await res.json();

        if (!data.success) {
            grid.html(`<p style="text-align:center; color:#b65a4a;">${data.error || "Failed to load trips."}</p>`);
            return;
        }

        const trips = data.trips || [];
        
        if (trips.length === 0) {
            grid.html(`<p style="text-align:center; color:#7a6a5b;">You haven't saved any trips yet.</p>`);
            return;
        }

        grid.empty();
        
        // helper to escape HTML
        function escapeHtml(str) {
            if (!str && str !== 0) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        // Format a short summary of top places with score and short reason
        function formatPlacesSummary(places) {
            if (!places || places.length === 0) return '<em>No places</em>';
            const parts = [];
            const top = places.slice(0, 3);
            top.forEach(p => {
                const name = escapeHtml(p.name || 'Unknown');
                const score = (typeof p.relevance_score === 'number') ? p.relevance_score : (typeof p.score === 'number' ? p.score : null);
                const reason = escapeHtml((p.matched_reason || p.reason || '').slice(0, 80));
                const scoreText = score !== null ? `<span class="small-score">${score}%</span>` : '';
                parts.push(`${name} ${scoreText}${reason ? `<div class=\"small-reason\">${reason}${(p.matched_reason || p.reason || '').length > 80 ? '...' : ''}</div>` : ''}`);
            });
            if (places.length > 3) parts.push('...');
            return parts.join('<br>');
        }

        trips.forEach(trip => {
            const imageUrl = `/static/images/image${Math.floor(Math.random() * 2) + 1}.jpg`;
            const totalCost = trip.places.reduce((sum, p) => {
                const match = (p.cost || "").match(/\d+(\.\d+)?/);
                return sum + (match ? parseFloat(match[0]) : 0);
            }, 0);
            const firstTime = trip.places[0]?.duration || "—";
            const lastTime = trip.places[trip.places.length - 1]?.duration || "—";

            const placesSummary = formatPlacesSummary(trip.places || []);

            const card = `
                <div class="trip-card" data-trip-id="${escapeHtml(trip._id)}">
                    <div class="card-image">
                        <img src="${imageUrl}" alt="Trip thumbnail" class="card-thumbnail"/>
                        <div class="relevance-badge"><span>${escapeHtml("$".repeat(trip.budget || 1))}</span></div>
                    </div>
                    <div class="card-body">
                        <h3 class="card-title">${escapeHtml(trip.starting_address || "Unknown Trip")}</h3>
                        <p class="card-address">${escapeHtml((trip.interests || []).join(', ') || 'No interests')}</p>
                        <p class="card-description">
                            ${placesSummary}
                        </p>
                    </div>
                    <div class="card-footer">
                        <div class="footer-left">
                            <div class="card-price">~ $${totalCost.toFixed(2)}</div>
                            <div class="card-time">${escapeHtml(firstTime)} - ${escapeHtml(lastTime)}</div>
                        </div>
                        <div class="footer-right">
                            <button class="btn-small" onclick="editTrip('${escapeHtml(trip._id)}')">Edit</button>
                            <button class="btn-small" onclick="shareTrip('${escapeHtml(trip._id)}')">Share</button>
                        </div>
                    </div>
                </div>
            `;
            grid.append(card);
        });
    } catch (err) {
        console.error(err);
        grid.html(`<p style="text-align:center; color:#b65a4a;">Error loading trips.</p>`);
    }
}

// ---------- Header UI ----------
async function updateHeaderUI() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;
    
    const user = await checkLogin();

    if (user) {
        headerActions.innerHTML = `
            <span>Welcome, ${user.first_name}!</span>
            <button id="guided-setup-btn" class="btn-guided">Guided Setup</button>
            <button id="logout-btn" class="btn-secondary">LOG OUT</button>
        `;
        document.getElementById('logout-btn')?.addEventListener('click', logout);
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