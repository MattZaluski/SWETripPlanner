document.addEventListener('DOMContentLoaded', () => {
    console.log('📋 [FLOW 1] DOMContentLoaded fired');
    
    // Create debug panel
    const debugPanel = document.createElement('div');
    debugPanel.id = 'debug-panel';
    debugPanel.style.cssText = 'position:fixed;bottom:10px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;padding:12px;border-radius:8px;font-family:monospace;font-size:11px;z-index:9999;max-width:350px;max-height:300px;overflow:auto;';
    debugPanel.innerHTML = '<strong>🔧 Debug Panel</strong><br>';
    document.body.appendChild(debugPanel);
    
    function debugLog(step, msg, isError = false) {
        const color = isError ? '#f66' : '#0f0';
        const timestamp = new Date().toLocaleTimeString();
        const line = `<div style="color:${color}">[${timestamp}] ${step}: ${msg}</div>`;
        debugPanel.innerHTML += line;
        debugPanel.scrollTop = debugPanel.scrollHeight;
        console.log(`${step}: ${msg}`);
    }
    
    debugLog('FLOW 1', 'DOMContentLoaded ✓');
    
    const searchBtn = document.getElementById('search-btn');
    const startingAddressInput = document.getElementById('starting-address');
    const maxDistanceSelect = document.getElementById('max-distance');
    const interestsInput = document.getElementById('interests');
    const budgetSlider = document.getElementById('budget');
    const travelModeSelect = document.getElementById('travel-mode');
    const cardsContainer = document.getElementById('cards-container');
    const loadingMessage = document.getElementById('loading');
    
    debugLog('FLOW 1', `Elements: searchBtn=${!!searchBtn}, mapSection=${!!document.getElementById('map-section')}`);

    // Pagination state
    let allItineraryItems = [];
    let displayedCount = 0;
    const CARDS_PER_LOAD = 3;
    let searchSessionId = null;
    let currentOffset = 0;
    let hasMoreResults = false;
    let isLoadingMore = false;

    // Itinerary state
    let itineraryItems = [];
    const itineraryCardsContainer = document.getElementById('itinerary-cards');

    // Store starting coordinates and travel mode
    let startingCoords = null;
    let currentTravelMode = 'driving-car';

    // Pre-loaded activities from AI generation
    let preloadedActivities = null;

    // Map State
    let map = null;
    let markers = [];
    let distanceLabels = [];  // Distance/time labels on route
    let geoapifyKey = null;
    let mapInitialized = false;
    let routeLayerId = 'route-line';
    let routeSourceId = 'route-source';
    let routeGeometry = null;  // Store route geometry from API
    let isPlayingRoute = false;  // Animation state
    let mockMode = false;  // MOCK mode flag from server

    // Mobile View State
    const toggleViewBtn = document.getElementById('toggle-view-btn');
    const cardsSection = document.querySelector('.cards-section');
    const mapSection = document.getElementById('map-section');
    let isMapViewAndMobile = false;

    // Budget slider label update
    const budgetLabel = document.querySelector('.budget-label');
    const budgetLabels = ['Low', 'Medium', 'High'];

    budgetSlider.addEventListener('input', (e) => {
        budgetLabel.textContent = budgetLabels[parseInt(e.target.value)];
    });

    // Toggle View Button (Mobile)
    if (toggleViewBtn) {
        toggleViewBtn.addEventListener('click', toggleMobileView);
    }

    // Initialize
    initializePage();

    // Search button click handler
    searchBtn.addEventListener('click', () => handleSearch());

    // Enter key handler for search input
    startingAddressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    async function handleSearch(usePreloaded = false) {
        debugLog('FLOW 4', 'handleSearch() called');
        
        // If we have preloaded activities from AI generation, use those
        if (usePreloaded && preloadedActivities) {
            debugLog('FLOW 4', 'Using preloaded activities');
            displayCards(preloadedActivities);
            preloadedActivities = null; // Clear after use
            return;
        }

        const startingAddress = startingAddressInput.value.trim();
        debugLog('FLOW 4', `Starting address: "${startingAddress}"`);
        
        const interests = interestsInput.value.split(',').map(i => i.trim()).filter(i => i);
        const maxDistance = parseFloat(maxDistanceSelect.value);
        const budgetValue = parseInt(budgetSlider.value);
        const budget = budgetLabels[budgetValue];
        const travelMode = travelModeSelect.value;
        const useWeather = document.getElementById('use-weather-checkbox').checked;

        currentTravelMode = travelMode;

        if (!startingAddress) {
            alert('Please enter a starting address');
            return;
        }

        loadingMessage.style.display = 'block';
        cardsContainer.innerHTML = '';

        // Reset pagination state for new search
        searchSessionId = null;
        currentOffset = 0;
        hasMoreResults = false;

        itineraryItems = [];
        itineraryCardsContainer.innerHTML = '<p class="empty-itinerary-message">Add activities to your itinerary</p>';
        updateItineraryTotals();

        debugLog('FLOW 4', 'Fetching /api/plan...');
        try {
            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('session_token')
                },
                body: JSON.stringify({
                    starting_address: startingAddress,
                    interests: interests,
                    budget: budget,
                    max_distance: maxDistance,
                    travel_mode: travelMode,
                    use_weather: useWeather,
                    offset: 0,
                    limit: 10
                })
            });

            const result = await response.json();
            debugLog('FLOW 5', `API response: ${result.itinerary?.length || 0} items, starting_coords: ${JSON.stringify(result.starting_coords)}`);

            if (result.error) {
                debugLog('FLOW 5', `❌ API error: ${result.error}`, true);
                alert(result.error);
                loadingMessage.style.display = 'none';
                return;
            }

            // Store pagination state
            searchSessionId = result.session_id;
            currentOffset = result.limit;
            hasMoreResults = result.has_more;

            // Store starting coordinates
            startingCoords = result.starting_coords;
            debugLog('FLOW 5', `startingCoords set to: ${JSON.stringify(startingCoords)}`);

            // Display weather widget
            displayWeatherWidget(result.weather);

            debugLog('FLOW 6', 'Calling displayCards()...');
            displayCards(result.itinerary || []);

        } catch (err) {
            debugLog('FLOW 5', `❌ Fetch error: ${err.message}`, true);
            alert('Error: ' + err.message);
            loadingMessage.style.display = 'none';
        }
    }

    async function initializePage() {
        debugLog('FLOW 2', 'initializePage() called');
        try {
            // Fetch config (API Keys)
            debugLog('FLOW 2', 'Fetching /api/config...');
            const response = await fetch('/api/config');
            const config = await response.json();
            geoapifyKey = config.geoapify_key;
            
            // Store mock mode for auth handling
            window.mockMode = config.mock_mode || false;
            
            // In MOCK mode, set a test token if none exists
            if (window.mockMode && !localStorage.getItem('session_token')) {
                localStorage.setItem('session_token', 'mock-test-token');
                debugLog('FLOW 2', '🧪 MOCK mode: Set test session token');
            }
            
            debugLog('FLOW 2', `Config loaded, geoapifyKey: ${geoapifyKey ? 'present' : 'null (OSM mode)'}, mockMode: ${window.mockMode}`);

            // Initialize Map
            debugLog('FLOW 3', 'Calling initializeMap()...');
            initializeMap();

        } catch (err) {
            debugLog('FLOW 2', `❌ ERROR: ${err.message}`, true);
            console.error('❌ Failed to initialize page:', err);
        }
    }

    function initializeMap() {
        debugLog('FLOW 3', `initializeMap() - mapInitialized=${mapInitialized}`);
        if (mapInitialized) {
            debugLog('FLOW 3', 'Map already initialized, skipping');
            return;
        }
        
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            debugLog('FLOW 3', '❌ ERROR: #map container not found!', true);
            return;
        }
        const rect = mapContainer.getBoundingClientRect();
        debugLog('FLOW 3', `#map container: ${rect.width}x${rect.height}px at (${rect.left},${rect.top})`);
        
        if (rect.width === 0 || rect.height === 0) {
            debugLog('FLOW 3', '⚠️ Warning: map container has zero dimensions!', true);
        }

        // Default to a central US location
        const defaultCenter = [-98.5795, 39.8283];
        const defaultZoom = 3;

        // Use Geoapify if API key available, otherwise use free OpenStreetMap tiles
        let mapStyle;
        if (geoapifyKey) {
            mapStyle = `https://maps.geoapify.com/v1/styles/osm-bright/style.json?apiKey=${geoapifyKey}`;
        } else {
            // Free OpenStreetMap raster tiles - no API key required
            mapStyle = {
                version: 8,
                name: 'OpenStreetMap',
                sources: {
                    'osm-tiles': {
                        type: 'raster',
                        tiles: [
                            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                        ],
                        tileSize: 256,
                        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    }
                },
                layers: [{
                    id: 'osm-tiles-layer',
                    type: 'raster',
                    source: 'osm-tiles',
                    minzoom: 0,
                    maxzoom: 19
                }]
            };
            console.log('🗺️ Using free OpenStreetMap tiles (no API key required)');
        }

        debugLog('FLOW 3', 'Creating MapLibre map...');
        try {
            map = new maplibregl.Map({
                container: 'map',
                style: mapStyle,
                center: defaultCenter,
                zoom: defaultZoom,
                attributionControl: true
            });
            debugLog('FLOW 3', 'MapLibre Map object created ✓');
        } catch (e) {
            debugLog('FLOW 3', `❌ MapLibre creation error: ${e.message}`, true);
            return;
        }

        // Add navigation controls (zoom buttons, compass)
        map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
        
        // Add scale bar for distance reference
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'imperial' }), 'bottom-left');
        
        // Add fullscreen control for immersive viewing
        map.addControl(new maplibregl.FullscreenControl(), 'top-right');

        map.on('load', () => {
            mapInitialized = true;
            debugLog('FLOW 3', '✅ Map "load" event fired - map ready!');
            // If we have activities already loaded, show them
            if (allItineraryItems.length > 0 || itineraryItems.length > 0) {
                updateMapState();
            }
        });

        // Handle map errors gracefully
        map.on('error', (e) => {
            debugLog('FLOW 3', `❌ Map error event: ${e.error?.message || JSON.stringify(e.error)}`, true);
            console.error('Map error:', e.error);
        });
    }

    function updateMapState(centerOnResults = true) {
        debugLog('FLOW 7', `updateMapState() - map=${!!map}, mapInitialized=${mapInitialized}`);
        
        if (!map) {
            debugLog('FLOW 7', '⚠️ map is null, cannot update', true);
            return;
        }
        if (!mapInitialized) {
            debugLog('FLOW 7', '⚠️ map not initialized yet, cannot update', true);
            return;
        }

        const cardCount = document.querySelectorAll('.activity-card').length;
        debugLog('FLOW 7', `startingCoords=${JSON.stringify(startingCoords)}, cards=${cardCount}`);

        // Clear existing markers
        markers.forEach(marker => marker.remove());
        markers = [];

        // Bounds to fit all points
        const bounds = new maplibregl.LngLatBounds();
        let hasPoints = false;

        // Helper function to create rich popup content
        function createPopupHTML(item, type, index = null) {
            const typeEmoji = {
                start: '📍',
                selected: '✅',
                candidate: '🔍'
            };
            
            const title = index !== null ? `${index + 1}. ${item.name || 'Starting Point'}` : (item.name || 'Starting Point');
            const emoji = typeEmoji[type] || '';
            
            let html = `
                <div style="font-family: system-ui, sans-serif; max-width: 220px;">
                    <div style="font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #1f2937;">
                        ${emoji} ${title}
                    </div>
            `;
            
            if (item.address) {
                html += `<div style="font-size: 12px; color: #6b7280; margin-bottom: 6px;">📍 ${item.address}</div>`;
            }
            
            if (item.cost && item.cost !== 'N/A') {
                html += `<div style="font-size: 12px; color: #059669; font-weight: 500;">💰 ${item.cost}</div>`;
            }
            
            if (item.travel_time_min) {
                html += `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">🚗 ${item.travel_time_min} min away</div>`;
            }
            
            if (type === 'candidate') {
                html += `<div style="margin-top: 8px; font-size: 11px; color: #C27D61; font-weight: 500;">Click card to add to itinerary →</div>`;
            }
            
            html += '</div>';
            return html;
        }

        // 1. Add Start Location Marker
        if (startingCoords) {
            debugLog('FLOW 7', `Adding start marker at [${startingCoords.lng}, ${startingCoords.lat}]`);
            const el = document.createElement('div');
            el.className = 'legend-dot start';
            el.innerHTML = '🏠';
            el.style.fontSize = '14px';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.background = 'linear-gradient(135deg, #f7b731 0%, #e67e22 100%)';

            const popup = new maplibregl.Popup({ offset: 25, closeButton: false })
                .setHTML(createPopupHTML({ name: 'Your Starting Point', address: startingAddressInput.value }, 'start'));

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([startingCoords.lng, startingCoords.lat])
                .setPopup(popup)
                .addTo(map);

            markers.push(marker);
            bounds.extend([startingCoords.lng, startingCoords.lat]);
            hasPoints = true;
        } else {
            debugLog('FLOW 7', '⚠️ No startingCoords available');
        }

        // 2. Add Itinerary Items (Selected) with numbered markers
        debugLog('FLOW 7', `Adding ${itineraryItems.length} itinerary markers`);
        itineraryItems.forEach((item, index) => {
            if (item.lat && item.lng) {
                const el = document.createElement('div');
                el.className = 'legend-dot selected';
                el.textContent = index + 1;

                const popup = new maplibregl.Popup({ offset: 30, closeButton: false })
                    .setHTML(createPopupHTML(item, 'selected', index));

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([item.lng, item.lat])
                    .setPopup(popup)
                    .addTo(map);

                // Hover on marker -> highlight corresponding itinerary card
                el.addEventListener('mouseenter', () => {
                    const itineraryCard = document.querySelector(`.itinerary-card[data-index="${index}"]`);
                    if (itineraryCard) {
                        itineraryCard.classList.add('highlight-card');
                    }
                });
                el.addEventListener('mouseleave', () => {
                    const itineraryCard = document.querySelector(`.itinerary-card[data-index="${index}"]`);
                    if (itineraryCard) {
                        itineraryCard.classList.remove('highlight-card');
                    }
                });

                markers.push(marker);
                bounds.extend([item.lng, item.lat]);
                hasPoints = true;
            }
        });

        // 3. Add Candidate Items (Search Results)
        const visibleCandidates = document.querySelectorAll('.activity-card');
        visibleCandidates.forEach(card => {
            const dataAttr = card.getAttribute('data-activity-data');
            if (!dataAttr) return;
            
            const item = JSON.parse(dataAttr);
            const isSelected = itineraryItems.some(i => i.name === item.name && i.lat === item.lat);

            if (!isSelected && item.lat && item.lng) {
                const el = document.createElement('div');
                el.className = 'legend-dot candidate';
                el.style.cursor = 'pointer';

                const popup = new maplibregl.Popup({ offset: 20, closeButton: false })
                    .setHTML(createPopupHTML(item, 'candidate'));

                const marker = new maplibregl.Marker({ element: el })
                    .setLngLat([item.lng, item.lat])
                    .setPopup(popup)
                    .addTo(map);

                // Bi-directional sync: Hover card -> highlight marker
                card.addEventListener('mouseenter', () => {
                    el.style.transform = 'scale(1.5)';
                    el.style.zIndex = '100';
                    el.style.boxShadow = '0 4px 12px rgba(194, 125, 97, 0.5)';
                    marker.togglePopup();
                });
                card.addEventListener('mouseleave', () => {
                    el.style.transform = 'scale(1)';
                    el.style.zIndex = '1';
                    el.style.boxShadow = '';
                    if (marker.getPopup().isOpen()) marker.togglePopup();
                });

                // Bi-directional sync: Click marker -> scroll to card and highlight
                marker.getElement().addEventListener('click', () => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight-card');
                    setTimeout(() => card.classList.remove('highlight-card'), 1500);
                });

                markers.push(marker);
                bounds.extend([item.lng, item.lat]);
                hasPoints = true;
            }
        });

        // Update Route Line
        updateRouteLine();

        // Fit map to bounds
        debugLog('FLOW 7', `hasPoints=${hasPoints}, markers added: ${markers.length}`);
        if (hasPoints && centerOnResults) {
            debugLog('FLOW 7', '✅ Fitting map to bounds');
            map.fitBounds(bounds, {
                padding: { top: 50, bottom: 50, left: 50, right: 50 },
                maxZoom: 15
            });
        } else {
            debugLog('FLOW 7', `⚠️ Not fitting: hasPoints=${hasPoints}, centerOnResults=${centerOnResults}`);
        }
    }

    function updateRouteLine() {
        const routeOutlineId = 'route-line-outline';
        const routeAnimatedId = 'route-line-animated';
        
        if (!map || !map.loaded()) return;
        
        // First time setup for route source and layers
        if (!map.getSource(routeSourceId)) {
            map.addSource(routeSourceId, {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': []
                    }
                }
            });
            
            // Add outline layer first (renders behind) - white border
            map.addLayer({
                'id': routeOutlineId,
                'type': 'line',
                'source': routeSourceId,
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#ffffff',
                    'line-width': 10,
                    'line-opacity': 0.9
                }
            });
            
            // Add main route line on top - gradient green
            map.addLayer({
                'id': routeLayerId,
                'type': 'line',
                'source': routeSourceId,
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#8C9A6F',
                    'line-width': 6,
                    'line-opacity': 0.95
                }
            });
            
            // Add animated dashed overlay for "in progress" effect
            map.addLayer({
                'id': routeAnimatedId,
                'type': 'line',
                'source': routeSourceId,
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#C27D61',
                    'line-width': 3,
                    'line-dasharray': [0, 4, 3],
                    'line-opacity': 0.7
                }
            });
        }
        
        // Update dash pattern based on travel mode
        const isDashed = currentTravelMode === 'foot-walking';
        const dashPattern = isDashed ? [2, 1] : [1, 0];
        map.setPaintProperty(routeLayerId, 'line-dasharray', dashPattern);
        
        // Use real geometry if available, otherwise use waypoint straight lines
        let coords = [];
        if (routeGeometry && routeGeometry.length > 0) {
            coords = routeGeometry;
            debugLog('MAP', `Using real route geometry: ${coords.length} points`);
        } else {
            // Fallback to straight lines between waypoints
            if (startingCoords) coords.push([startingCoords.lng, startingCoords.lat]);
            itineraryItems.forEach(item => {
                if (item.lat && item.lng) coords.push([item.lng, item.lat]);
            });
            debugLog('MAP', `Using straight-line route: ${coords.length} points`);
        }

        const geojson = {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': coords
            }
        };

        if (map.getSource(routeSourceId)) {
            map.getSource(routeSourceId).setData(geojson);
        }
    }
    
    // Clear existing distance labels from map
    function clearDistanceLabels() {
        distanceLabels.forEach(label => label.remove());
        distanceLabels = [];
    }
    
    // Add distance/time labels between waypoints on the map
    function addDistanceLabels(legs) {
        clearDistanceLabels();
        
        if (!legs || legs.length === 0 || !map) return;
        
        // Get all waypoints in order
        const waypoints = [];
        if (startingCoords) waypoints.push(startingCoords);
        itineraryItems.forEach(item => {
            if (item.lat && item.lng) waypoints.push({ lat: item.lat, lng: item.lng });
        });
        
        // Add label for each leg
        legs.forEach((leg, index) => {
            if (index >= waypoints.length - 1) return;
            
            const from = waypoints[index];
            const to = waypoints[index + 1];
            
            // Calculate midpoint for label placement
            const midLat = (from.lat + to.lat) / 2;
            const midLng = (from.lng + to.lng) / 2;
            
            // Format distance and time
            const distText = leg.distance_km < 1 
                ? `${Math.round(leg.distance_km * 1000)}m` 
                : `${leg.distance_km.toFixed(1)}km`;
            const timeText = leg.time_min < 60 
                ? `${Math.round(leg.time_min)}min` 
                : `${Math.floor(leg.time_min / 60)}h ${Math.round(leg.time_min % 60)}m`;
            
            // Travel mode icon
            const modeIcon = currentTravelMode === 'foot-walking' ? '🚶' : 
                            currentTravelMode === 'cycling-regular' ? '🚴' : '🚗';
            
            // Create label element
            const el = document.createElement('div');
            el.className = 'route-distance-label';
            el.innerHTML = `
                <span class="distance-icon">${modeIcon}</span>
                <span class="distance-text">${distText}</span>
                <span class="time-text">${timeText}</span>
            `;
            
            // Add as custom marker
            const label = new maplibregl.Marker({ element: el, anchor: 'center' })
                .setLngLat([midLng, midLat])
                .addTo(map);
            
            distanceLabels.push(label);
        });
    }
    
    // Animate route playback - "Watch your trip" feature
    async function playRouteAnimation() {
        if (isPlayingRoute || !routeGeometry || routeGeometry.length < 2) {
            debugLog('MAP', 'Cannot play route: no geometry or already playing');
            return;
        }
        
        isPlayingRoute = true;
        const playBtn = document.getElementById('play-route-btn');
        if (playBtn) {
            playBtn.textContent = '⏹️ Stop';
            playBtn.classList.add('playing');
        }
        
        // Zoom to start
        map.flyTo({
            center: routeGeometry[0],
            zoom: 15,
            duration: 1000
        });
        
        await new Promise(r => setTimeout(r, 1200));
        
        // Animate along the route
        const totalPoints = routeGeometry.length;
        const animationDuration = 8000; // 8 seconds total
        const stepDelay = animationDuration / totalPoints;
        
        for (let i = 0; i < totalPoints && isPlayingRoute; i++) {
            const point = routeGeometry[i];
            
            map.easeTo({
                center: point,
                zoom: 15 - (i / totalPoints) * 2, // Gradually zoom out
                bearing: i > 0 ? getBearing(routeGeometry[i-1], point) : 0,
                pitch: 45,
                duration: stepDelay
            });
            
            await new Promise(r => setTimeout(r, stepDelay * 0.9));
        }
        
        // Reset view at end
        if (isPlayingRoute) {
            map.flyTo({
                center: routeGeometry[routeGeometry.length - 1],
                zoom: 13,
                pitch: 0,
                bearing: 0,
                duration: 1500
            });
        }
        
        isPlayingRoute = false;
        if (playBtn) {
            playBtn.textContent = '▶️ Watch Trip';
            playBtn.classList.remove('playing');
        }
    }
    
    function stopRouteAnimation() {
        isPlayingRoute = false;
        const playBtn = document.getElementById('play-route-btn');
        if (playBtn) {
            playBtn.textContent = '▶️ Watch Trip';
            playBtn.classList.remove('playing');
        }
    }
    
    // Calculate bearing between two points for smooth camera rotation
    function getBearing(start, end) {
        const startLat = start[1] * Math.PI / 180;
        const startLng = start[0] * Math.PI / 180;
        const endLat = end[1] * Math.PI / 180;
        const endLng = end[0] * Math.PI / 180;
        
        const dLng = endLng - startLng;
        const x = Math.cos(endLat) * Math.sin(dLng);
        const y = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
        
        return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
    }
    
    // Generate Google Maps URL for the itinerary
    function generateGoogleMapsUrl() {
        if (!startingCoords || itineraryItems.length === 0) return null;
        
        // Google Maps directions URL format
        let url = 'https://www.google.com/maps/dir/';
        
        // Add starting point
        url += `${startingCoords.lat},${startingCoords.lng}/`;
        
        // Add all waypoints
        itineraryItems.forEach(item => {
            if (item.lat && item.lng) {
                url += `${item.lat},${item.lng}/`;
            }
        });
        
        return url;
    }

    function toggleMobileView() {
        isMapViewAndMobile = !isMapViewAndMobile;
        const toggleText = toggleViewBtn.querySelector('.toggle-text');

        if (isMapViewAndMobile) {
            cardsSection.classList.add('hide-mobile');
            mapSection.classList.add('active');
            toggleText.textContent = 'Show List';
            // Resize map when it becomes visible
            if (map) map.resize();
        } else {
            cardsSection.classList.remove('hide-mobile');
            mapSection.classList.remove('active');
            toggleText.textContent = 'Show Map';
        }
    }

    function displayWeatherWidget(weather) {
        if (!weather) return;

        const weatherWidget = document.getElementById('weather-widget');
        const weatherIcon = document.getElementById('weather-icon');
        const weatherTemp = document.getElementById('weather-temp');
        const weatherCondition = document.getElementById('weather-condition');
        const precipValue = document.getElementById('precip-value');

        // Show the widget
        weatherWidget.style.display = 'block';

        // Update weather icon based on conditions
        const icons = {
            'clear': '☀️',
            'partly cloudy': '⛅',
            'cloudy': '☁️',
            'rainy': '🌧️',
            'stormy': '⛈️'
        };
        weatherIcon.textContent = icons[weather.summary] || '🌤️';

        // Update temperature and condition
        weatherTemp.textContent = `${weather.temp_f}°F`;
        weatherCondition.textContent = weather.summary;
        precipValue.textContent = `${weather.max_precip_probability}%`;

        // Apply "poor weather" styling if needed
        if (weather.has_poor_weather) {
            weatherWidget.classList.add('has-poor-weather');
        } else {
            weatherWidget.classList.remove('has-poor-weather');
        }
    }

    function displayCards(itinerary, append = false) {
        debugLog('FLOW 6', `displayCards() called with ${itinerary?.length || 0} items, append=${append}`);
        loadingMessage.style.display = 'none';

        if (!append) {
            cardsContainer.innerHTML = '';
        }

        if (!itinerary || itinerary.length === 0) {
            debugLog('FLOW 6', 'No items to display');
            if (!append) {
                cardsContainer.innerHTML = `
                    <div class="empty-message">
                        <p>No activities found. Try adjusting your search criteria.</p>
                    </div>
                `;
            }
            updateLoadMoreButton();
            return;
        }

        // Display all cards immediately (no incremental loading from memory)
        itinerary.forEach((item, index) => {
            const card = createActivityCard(item, index);
            cardsContainer.appendChild(card);
        });
        debugLog('FLOW 6', `${itinerary.length} cards created ✓`);

        updateLoadMoreButton();

        // Update map whenever cards are displayed
        debugLog('FLOW 7', 'Calling updateMapState()...');
        updateMapState(!append); // Only center on results if it's a fresh search
    }

    function updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-btn');

        if (!loadMoreBtn) {
            return;
        }

        // Show button only if there are more results on the server
        if (hasMoreResults && !isLoadingMore) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.textContent = 'Load More Activities';
            loadMoreBtn.disabled = false;
        } else if (isLoadingMore) {
            loadMoreBtn.style.display = 'block';
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        } else {
            loadMoreBtn.style.display = 'none';
        }
    }

    async function loadMoreCards() {
        if (isLoadingMore || !hasMoreResults || !searchSessionId) {
            return;
        }

        isLoadingMore = true;
        updateLoadMoreButton();

        try {
            const startingAddress = startingAddressInput.value.trim();
            const interests = interestsInput.value.split(',').map(i => i.trim()).filter(i => i);
            const maxDistance = parseFloat(maxDistanceSelect.value);
            const budgetValue = parseInt(budgetSlider.value);
            const budget = budgetLabels[budgetValue];
            const travelMode = travelModeSelect.value;
            const useWeather = document.getElementById('use-weather-checkbox').checked;

            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('session_token')
                },
                body: JSON.stringify({
                    starting_address: startingAddress,
                    interests: interests,
                    budget: budget,
                    max_distance: maxDistance,
                    travel_mode: travelMode,
                    use_weather: useWeather,
                    session_id: searchSessionId,
                    offset: currentOffset,
                    limit: 10
                })
            });

            const result = await response.json();

            if (result.error) {
                alert(result.error);
                return;
            }

            // Update pagination state
            currentOffset += result.limit;
            hasMoreResults = result.has_more;

            // Append new cards
            displayCards(result.itinerary || [], true);

        } catch (err) {
            alert('Error loading more: ' + err.message);
        } finally {
            isLoadingMore = false;
            updateLoadMoreButton();
        }
    }

    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'load-more-btn') {
            loadMoreCards();
        }
    });

    function createActivityCard(item, index) {
        const card = document.createElement('div');
        card.className = 'activity-card';
        card.setAttribute('data-activity-id', index);
        card.setAttribute('data-activity-data', JSON.stringify(item));

        const isInItinerary = itineraryItems.some(i => JSON.stringify(i) === JSON.stringify(item));

        const rating = Math.floor(Math.random() * 2) + 3;
        const stars = createStarRating(rating);

        // Use matched_reason if available, otherwise fallback to generic reason
        const description = item.matched_reason || item.reason || 'A great place to visit during your trip.';
        const shortDescription = description.substring(0, 140) + (description.length > 140 ? '...' : '');

        // Alternate between two placeholder images
        const imageUrl = index % 2 === 0 ? '/static/images/image1.jfif' : '/static/images/image2.jpg';

        // Display distance and travel time
        const distanceKm = item.distance_km || 0;
        const travelTimeMin = item.travel_time_min || 0;
        const distanceDisplay = distanceKm > 0 ? `${distanceKm} km • ${travelTimeMin} min away` : `${travelTimeMin} min away`;

        // Relevance score badge
        const relevanceScore = item.relevance_score || 0;
        const relevanceBadgeColor = relevanceScore >= 80 ? 'excellent' : relevanceScore >= 60 ? 'good' : 'moderate';
        const relevanceBadge = relevanceScore > 0 ? `
            <div class="relevance-badge ${relevanceBadgeColor}">
                <span class="relevance-score">${relevanceScore}%</span>
                <span class="relevance-label">Match</span>
            </div>
        ` : '';

        const address = item.address || 'Address not available';

        // Weather warning display
        const weatherWarning = item.weather_warning ? `
            <div class="weather-warning">
                ${item.weather_warning}
            </div>
        ` : '';

        card.innerHTML = `
            <div class="card-image">
                <img src="${imageUrl}" alt="Activity" class="card-thumbnail">
                ${relevanceBadge}
            </div>
            <div class="card-body">
                <div class="card-rating">
                    ${stars}
                </div>
                <h3 class="card-title">${item.name || 'Activity'}</h3>
                <p class="card-address">📍 ${address}</p>
                ${weatherWarning}
                <p class="card-description">${shortDescription}</p>
                <div class="card-footer">
                    <div>
                        <div class="card-price">${item.cost || 'Free'}</div>
                        <div class="distance-info">🚗 ${distanceDisplay}</div>
                    </div>
                    <div class="card-actions">
                        <button class="add-btn" ${isInItinerary ? 'disabled' : ''}>${isInItinerary ? 'ADDED' : 'ADD'}</button>
                    </div>
                </div>
                <div class="card-time">
                    <span>🕐 ${item.time || 'All day'}</span>
                </div>
            </div>
        `;

        if (!isInItinerary) {
            const addBtn = card.querySelector('.add-btn');
            addBtn.addEventListener('click', () => addToItinerary(item, card, index));
        }

        return card;
    }

    async function addToItinerary(item, card, index) {
        if (itineraryItems.some(i => JSON.stringify(i) === JSON.stringify(item))) {
            return;
        }

        itineraryItems.push(item);
        
        // Track preference (AI learning)
        trackPreference('add', item);
        
        // Create card with correct index
        createItineraryCard(item, itineraryItems.length - 1);

        // Recalculate routing for entire itinerary
        await updateItineraryRouting();

        // Update map to show selection with smooth animation
        updateMapState(false);
        
        // Fly to the newly added location
        if (map && item.lat && item.lng) {
            map.flyTo({
                center: [item.lng, item.lat],
                zoom: 14,
                duration: 1500,
                essential: true
            });
        }

        const addBtn = card.querySelector('.add-btn');
        addBtn.textContent = 'ADDED';
        addBtn.disabled = true;
        addBtn.style.background = '#8C9A6F';

        const emptyMsg = itineraryCardsContainer.querySelector('.empty-itinerary-message');
        if (emptyMsg) {
            emptyMsg.style.display = 'none';
        }
    }

    function createItineraryCard(item, index) {
        const card = document.createElement('div');
        card.className = 'itinerary-card';
        card.setAttribute('data-item-id', JSON.stringify(item));
        card.setAttribute('data-index', index);
        card.draggable = true;  // Enable drag-to-reorder

        // Alternate between two placeholder images
        const imageUrl = Math.random() > 0.5 ? '/static/images/image1.jfif' : '/static/images/image2.jpg';

        const costText = item.cost || 'Free';
        const distanceKm = item.distance_km || 0;
        const address = item.address || 'Address not available';

        // Weather warning for itinerary
        const weatherWarning = item.weather_warning ? `
            <div class="itinerary-weather-warning">${item.weather_warning}</div>
        ` : '';

        card.innerHTML = `
            <div class="itinerary-drag-handle" title="Drag to reorder">⋮⋮</div>
            <div class="itinerary-card-number">${index + 1}</div>
            <div class="itinerary-card-image">
                <img src="${imageUrl}" alt="Activity" class="itinerary-thumbnail">
            </div>
            <div class="itinerary-card-body">
                <div class="itinerary-card-name">${item.name || 'Activity'}</div>
                <div class="itinerary-card-address">📍 ${address}</div>
                ${weatherWarning}
                <div class="itinerary-card-details">${distanceKm} km • ${costText}</div>
                <div class="itinerary-card-details itinerary-route-info">Calculating route...</div>
                <button class="itinerary-remove-btn" data-remove-id="${JSON.stringify(item)}">Remove</button>
            </div>
        `;

        const removeBtn = card.querySelector('.itinerary-remove-btn');
        removeBtn.addEventListener('click', () => removeFromItinerary(item, card));
        
        // Drag and drop event listeners
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragenter', handleDragEnter);
        card.addEventListener('dragleave', handleDragLeave);

        itineraryCardsContainer.appendChild(card);
    }
    
    // Drag-to-reorder functionality
    let draggedCard = null;
    
    function handleDragStart(e) {
        draggedCard = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.getAttribute('data-index'));
        
        // Make it semi-transparent while dragging
        setTimeout(() => {
            this.style.opacity = '0.5';
        }, 0);
    }
    
    function handleDragEnd(e) {
        this.classList.remove('dragging');
        this.style.opacity = '1';
        
        // Remove drag-over styling from all cards
        document.querySelectorAll('.itinerary-card').forEach(card => {
            card.classList.remove('drag-over');
        });
        
        draggedCard = null;
    }
    
    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
    
    function handleDragEnter(e) {
        e.preventDefault();
        if (this !== draggedCard) {
            this.classList.add('drag-over');
        }
    }
    
    function handleDragLeave(e) {
        this.classList.remove('drag-over');
    }
    
    async function handleDrop(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        
        if (draggedCard === this) return;
        
        const fromIndex = parseInt(draggedCard.getAttribute('data-index'));
        const toIndex = parseInt(this.getAttribute('data-index'));
        
        if (isNaN(fromIndex) || isNaN(toIndex)) return;
        
        // Reorder the itinerary array
        const [movedItem] = itineraryItems.splice(fromIndex, 1);
        itineraryItems.splice(toIndex, 0, movedItem);
        
        // Rebuild the itinerary cards
        rebuildItineraryCards();
        
        // Recalculate routing with new order
        await updateItineraryRouting();
        
        // Update map
        updateMapState(false);
        
        // Check for AI optimization suggestions after reorder
        checkRouteOptimization();
        
        debugLog('DRAG', `Moved item from ${fromIndex} to ${toIndex}`);
    }
    
    function rebuildItineraryCards() {
        // Clear container except for empty message
        const emptyMsg = itineraryCardsContainer.querySelector('.empty-itinerary-message');
        itineraryCardsContainer.innerHTML = '';
        
        if (itineraryItems.length === 0) {
            const msg = document.createElement('p');
            msg.className = 'empty-itinerary-message';
            msg.textContent = 'Add activities to your itinerary';
            itineraryCardsContainer.appendChild(msg);
        } else {
            itineraryItems.forEach((item, index) => {
                createItineraryCard(item, index);
            });
        }
    }

    async function removeFromItinerary(item, card) {
        itineraryItems = itineraryItems.filter(i => JSON.stringify(i) !== JSON.stringify(item));
        
        // Track preference (AI learning)
        trackPreference('remove', item);
        
        // Rebuild cards to update numbering (this clears and recreates all)
        rebuildItineraryCards();

        // Clear route geometry since itinerary changed
        routeGeometry = null;
        clearDistanceLabels();

        // Recalculate routing for remaining items
        await updateItineraryRouting();

        reEnableCardInMainView(item);
        
        // Update map
        updateMapState(false);
        
        // Update map when removing item
        updateMapState(false);
    }

    async function updateItineraryRouting() {
        if (itineraryItems.length === 0) {
            updateItineraryTotals();
            return;
        }

        // Build waypoints array: starting point + all activities
        const waypoints = [];

        if (startingCoords) {
            waypoints.push({
                lat: startingCoords.lat,
                lng: startingCoords.lng
            });
        }

        for (const item of itineraryItems) {
            if (item.lat && item.lng) {
                waypoints.push({
                    lat: item.lat,
                    lng: item.lng
                });
            }
        }

        if (waypoints.length < 2) {
            updateItineraryTotals();
            return;
        }

        try {
            const response = await fetch('/api/calculate-route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('session_token')
                },
                body: JSON.stringify({
                    waypoints: waypoints,
                    travel_mode: currentTravelMode
                })
            });

            const routeData = await response.json();

            if (routeData.error) {
                console.error('Routing error:', routeData.error);
                routeGeometry = null;
                clearDistanceLabels();
                updateItineraryTotals();
                return;
            }

            // Store route geometry for map display
            if (routeData.geometry && routeData.geometry.length > 0) {
                routeGeometry = routeData.geometry;
                debugLog('MAP', `Received route geometry: ${routeGeometry.length} points`);
            } else {
                routeGeometry = null;
            }
            
            // Update route line with real geometry
            updateRouteLine();
            
            // Add distance labels on map
            const legs = routeData.legs || [];
            addDistanceLabels(legs);

            // Update individual leg information in cards
            const itineraryCards = itineraryCardsContainer.querySelectorAll('.itinerary-card');

            itineraryCards.forEach((card, index) => {
                const routeInfo = card.querySelector('.itinerary-route-info');
                if (routeInfo && legs[index]) {
                    const leg = legs[index];
                    const modeIcon = currentTravelMode === 'foot-walking' ? '🚶' : 
                                    currentTravelMode === 'cycling-regular' ? '🚴' : '🚗';
                    routeInfo.innerHTML = `${modeIcon} ${leg.distance_km.toFixed(1)} km • ${Math.round(leg.time_min)} min from previous`;
                }
            });
            
            // Show/hide playback button based on itinerary
            updatePlayButton();

            // Update totals with cumulative data
            updateItineraryTotals(routeData);

        } catch (err) {
            console.error('Failed to calculate route:', err);
            routeGeometry = null;
            clearDistanceLabels();
            updateItineraryTotals();
        }
    }
    
    // Update the play button visibility
    function updatePlayButton() {
        let playBtn = document.getElementById('play-route-btn');
        
        if (itineraryItems.length >= 1 && startingCoords) {
            // Create button if doesn't exist
            if (!playBtn) {
                playBtn = document.createElement('button');
                playBtn.id = 'play-route-btn';
                playBtn.className = 'play-route-btn';
                playBtn.innerHTML = '▶️ Watch Trip';
                playBtn.title = 'Animate along your route with AI narration';
                
                playBtn.addEventListener('click', () => {
                    if (isPlayingRoute) {
                        stopRouteAnimation();
                        hideNarrationControls();
                    } else {
                        playRouteAnimationWithNarration();
                    }
                });
                
                // Add to map controls area
                const mapSection = document.getElementById('map-section');
                if (mapSection) {
                    mapSection.appendChild(playBtn);
                }
            }
            playBtn.style.display = 'flex';
            
            // Also add "Open in Google Maps" button
            let mapsBtn = document.getElementById('open-maps-btn');
            if (!mapsBtn) {
                mapsBtn = document.createElement('button');
                mapsBtn.id = 'open-maps-btn';
                mapsBtn.className = 'open-maps-btn';
                mapsBtn.innerHTML = '🗺️ Open in Maps';
                mapsBtn.title = 'Open route in Google Maps';
                
                mapsBtn.addEventListener('click', () => {
                    const url = generateGoogleMapsUrl();
                    if (url) {
                        window.open(url, '_blank');
                    }
                });
                
                const mapSection = document.getElementById('map-section');
                if (mapSection) {
                    mapSection.appendChild(mapsBtn);
                }
            }
            mapsBtn.style.display = 'flex';
        } else {
            if (playBtn) playBtn.style.display = 'none';
            const mapsBtn = document.getElementById('open-maps-btn');
            if (mapsBtn) mapsBtn.style.display = 'none';
        }
    }

function reEnableCardInMainView(item) {
        const allCards = document.querySelectorAll('.activity-card');
        allCards.forEach(card => {
            const cardData = JSON.parse(card.getAttribute('data-activity-data'));
            if (JSON.stringify(cardData) === JSON.stringify(item)) {
                const addBtn = card.querySelector('.add-btn');
                if (addBtn) {
                    addBtn.textContent = 'ADD';
                    addBtn.disabled = false;
                    addBtn.style.background = '';
                }
            }
        });
    }

function updateItineraryTotals(routeData = null) {
        let totalCost = 0;
        let totalTime = 0;
        let totalDistance = 0;

        // Calculate cost from items
        itineraryItems.forEach(item => {
            const costStr = item.cost || 'Free';
            if (costStr === 'Free') {
                totalCost += 0;
            } else if (costStr.includes('$')) {
                const cost = parseFloat(costStr.replace(/[^0-9.]/g, '')) || 0;
                totalCost += cost;
            }
        });

        // Use route data if available, otherwise fallback to individual travel times
        if (routeData) {
            totalDistance = routeData.total_distance_km || 0;
            totalTime = routeData.total_time_min || 0;
        } else {
            // Fallback: sum individual travel times
            itineraryItems.forEach(item => {
                totalTime += item.travel_time_min || 0;
            });
        }

        // Update display
        const totalCostEl = document.getElementById('total-cost');
        const totalTimeEl = document.getElementById('total-time');

        if (totalCostEl) {
            totalCostEl.textContent = `$${totalCost.toFixed(2)}`;
        }

        if (totalTimeEl) {
            const hours = Math.floor(totalTime / 60);
            const minutes = Math.round(totalTime % 60);
            let timeDisplay = '';
            if (totalDistance > 0) {
                timeDisplay = `${hours} hr ${minutes} min • ${totalDistance.toFixed(1)} km`;
            } else {
                timeDisplay = `${hours} hr ${minutes} min`;
            }
            totalTimeEl.textContent = timeDisplay;
        }
    }

function createStarRating(rating) {
        let stars = '';
        for (let i = 0; i < 5; i++) {
            if (i < rating) {
                stars += '<span class="star">★</span>';
            } else {
                stars += '<span class="star empty">★</span>';
            }
        }
        return stars;
    }

// Filter checkboxes (for future functionality)
const activityFilters = document.querySelectorAll('.activity-filter');
const weatherFilters = document.querySelectorAll('.weather-filter');

activityFilters.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        console.log('Filter changed:', checkbox.value, checkbox.checked);
    });
});

weatherFilters.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
        console.log('Weather filter changed:', checkbox.value, checkbox.checked);
    });
});

// ============ Guided Setup Modal ============

const guidedSetupBtn = document.getElementById('guided-setup-btn');
const modal = document.getElementById('guided-modal');
const modalClose = document.getElementById('modal-close');
const questionContainer = document.getElementById('question-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

let currentQuestion = 0;
const answers = {};

const questions = [
    {
        id: 'starting-address',
        title: 'Where are you starting from?',
        description: 'Enter your starting location or address',
        type: 'text',
        placeholder: 'e.g., Boston, MA',
        required: true
    },
    {
        id: 'interests',
        title: 'What are your interests?',
        description: 'Tell us what you enjoy - we\'ll find activities you\'ll love',
        type: 'text',
        placeholder: 'e.g., food, parks, museums, shopping',
        hint: 'Separate multiple interests with commas',
        required: false
    },
    {
        id: 'budget',
        title: 'What\'s your total budget?',
        description: 'Set the total amount you\'re willing to spend for the entire trip',
        type: 'budget-slider',
        min: 0,
        max: 500,
        default: 100,
        required: true
    },
    {
        id: 'max-distance',
        title: 'How far are you willing to travel?',
        description: 'Maximum distance in miles from your starting location',
        type: 'distance-slider',
        min: 5,
        max: 100,
        default: 30,
        required: true
    },
    {
        id: 'travel-mode',
        title: 'How will you be traveling?',
        description: 'Choose your preferred mode of transportation',
        type: 'button-group',
        options: [
            { value: 'driving-car', label: 'Car', icon: '🚗' },
            { value: 'cycling-regular', label: 'Bike', icon: '🚴' },
            { value: 'foot-walking', label: 'Walking', icon: '🚶' }
        ],
        required: true
    },
    {
        id: 'generation-mode',
        title: 'How would you like to build your itinerary?',
        description: 'Choose how you want to plan your trip',
        type: 'button-group',
        options: [
            { value: 'smart', label: 'Smart Generation', icon: '🤖', description: 'AI creates your complete itinerary' },
            { value: 'manual', label: 'Manual Selection', icon: '✋', description: 'Browse and choose yourself' }
        ],
        required: true
    },
    {
        id: 'time-period',
        title: 'What time period do you want to plan for?',
        description: 'Select your start and end times for the day',
        type: 'time-range',
        required: true,
        conditional: true,
        showIf: (answers) => answers['generation-mode'] === 'smart'
    }
];

function openModal() {
    modal.classList.add('active');
    currentQuestion = 0;

    // Ensure navigation buttons are visible
    if (prevBtn) prevBtn.style.display = 'inline-block';
    if (nextBtn) nextBtn.style.display = 'inline-block';

    renderQuestion();
    updateProgress();
}

function closeModal() {
    modal.classList.remove('active');
    currentQuestion = 0;
    Object.keys(answers).forEach(key => delete answers[key]);
}

function renderQuestion() {
    const question = questions[currentQuestion];
    let inputHTML = '';

    if (question.type === 'text' || question.type === 'number') {
        const savedValue = answers[question.id] || '';
        inputHTML = `
                <input 
                    type="${question.type}" 
                    id="q-${question.id}" 
                    placeholder="${question.placeholder}"
                    value="${savedValue}"
                    ${question.required ? 'required' : ''}
                >
                ${question.hint ? `<div class="input-hint">${question.hint}</div>` : ''}
            `;
    } else if (question.type === 'budget-slider') {
        const savedValue = answers[question.id] || question.default;
        inputHTML = `
                <div class="slider-container">
                    <input 
                        type="range" 
                        id="q-${question.id}" 
                        min="${question.min}" 
                        max="${question.max}" 
                        value="${savedValue}"
                        class="budget-range-slider"
                        ${question.required ? 'required' : ''}
                    >
                    <div class="slider-value-display">
                        <span class="slider-label">Total budget:</span>
                        <span class="slider-value" id="q-${question.id}-value">$${savedValue}</span>
                    </div>
                    <div class="slider-markers">
                        <span>$${question.min}</span>
                        <span>$${question.max}</span>
                    </div>
                </div>
            `;
    } else if (question.type === 'distance-slider') {
        const savedValue = answers[question.id] || question.default;
        inputHTML = `
                <div class="slider-container">
                    <input 
                        type="range" 
                        id="q-${question.id}" 
                        min="${question.min}" 
                        max="${question.max}" 
                        value="${savedValue}"
                        class="distance-range-slider"
                        ${question.required ? 'required' : ''}
                    >
                    <div class="slider-value-display">
                        <span class="slider-label">Maximum distance:</span>
                        <span class="slider-value" id="q-${question.id}-value">${savedValue} miles</span>
                    </div>
                    <div class="slider-markers">
                        <span>${question.min} mi</span>
                        <span>${question.max} mi</span>
                    </div>
                </div>
            `;
    } else if (question.type === 'button-group') {
        const savedValue = answers[question.id] || question.options[0].value;
        inputHTML = `
                <div class="button-group" id="q-${question.id}">
                    ${question.options.map(opt => `
                        <button 
                            type="button" 
                            class="option-button ${savedValue === opt.value ? 'selected' : ''}" 
                            data-value="${opt.value}"
                        >
                            <span class="option-icon">${opt.icon}</span>
                            <span class="option-label">${opt.label}</span>
                            ${opt.description ? `<span class="option-description">${opt.description}</span>` : ''}
                        </button>
                    `).join('')}
                </div>
            `;
    } else if (question.type === 'select') {
        const savedValue = answers[question.id] || question.options[0].value;
        inputHTML = `
                <select id="q-${question.id}" ${question.required ? 'required' : ''}>
                    ${question.options.map(opt =>
            `<option value="${opt.value}" ${savedValue === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('')}
                </select>
            `;
    } else if (question.type === 'time-range') {
        const savedValue = answers[question.id] || { start: '09:00', end: '17:00' };
        const startTime = typeof savedValue === 'object' ? savedValue.start : '09:00';
        const endTime = typeof savedValue === 'object' ? savedValue.end : '17:00';

        // Generate time options from 6 AM to 11 PM in 30-minute increments
        const timeOptions = [];
        for (let hour = 6; hour <= 23; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const timeValue = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
                const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayTime = `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
                timeOptions.push({ value: timeValue, label: displayTime });
            }
        }

        inputHTML = `
                <div class="time-range-inputs">
                    <div class="time-input-group">
                        <label for="q-${question.id}-start">Start Time:</label>
                        <select id="q-${question.id}-start" ${question.required ? 'required' : ''}>
                            ${timeOptions.map(opt =>
            `<option value="${opt.value}" ${startTime === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('')}
                        </select>
                    </div>
                    <div class="time-input-group">
                        <label for="q-${question.id}-end">End Time:</label>
                        <select id="q-${question.id}-end" ${question.required ? 'required' : ''}>
                            ${timeOptions.map(opt =>
            `<option value="${opt.value}" ${endTime === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('')}
                        </select>
                    </div>
                </div>
                <div class="input-hint">Choose your trip start and end times</div>
            `;
    }

    questionContainer.innerHTML = `
            <div class="question">
                <h3>${question.title}</h3>
                <p>${question.description}</p>
                ${inputHTML}
            </div>
        `;

    // Add event listeners based on input type
    if (question.type === 'budget-slider' || question.type === 'distance-slider') {
        const slider = document.querySelector(`#q-${question.id}`);
        const valueDisplay = document.querySelector(`#q-${question.id}-value`);

        if (slider && valueDisplay) {
            slider.addEventListener('input', (e) => {
                const value = e.target.value;
                if (question.type === 'budget-slider') {
                    valueDisplay.textContent = `$${value}`;
                } else {
                    valueDisplay.textContent = `${value} miles`;
                }
            });
        }
    } else if (question.type === 'button-group') {
        const buttonGroup = document.querySelector(`#q-${question.id}`);
        const buttons = buttonGroup.querySelectorAll('.option-button');

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove selected class from all buttons
                buttons.forEach(btn => btn.classList.remove('selected'));
                // Add selected class to clicked button
                button.classList.add('selected');
            });
        });
    } else {
        // Focus on input for text/number types
        setTimeout(() => {
            const input = document.querySelector(`#q-${question.id}`);
            if (input && question.type !== 'select' && question.type !== 'button-group') {
                input.focus();
            }
        }, 100);

        // Handle Enter key
        const input = document.querySelector(`#q-${question.id}`);
        if (input && question.type !== 'button-group') {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && currentQuestion < questions.length - 1) {
                    e.preventDefault();
                    nextQuestion();
                }
            });
        }
    }
}

function updateProgress() {
    const progress = ((currentQuestion + 1) / questions.length) * 100;
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `Question ${currentQuestion + 1} of ${questions.length}`;

    // Update button states
    prevBtn.disabled = currentQuestion === 0;

    if (currentQuestion === questions.length - 1) {
        nextBtn.textContent = 'Finish & Search';
        nextBtn.classList.add('finish-btn');
    } else {
        nextBtn.textContent = 'Next';
        nextBtn.classList.remove('finish-btn');
    }
}

function saveCurrentAnswer() {
    const question = questions[currentQuestion];

    if (question.type === 'time-range') {
        const startInput = document.querySelector(`#q-${question.id}-start`);
        const endInput = document.querySelector(`#q-${question.id}-end`);
        if (startInput && endInput) {
            answers[question.id] = {
                start: startInput.value,
                end: endInput.value
            };
        }
    } else if (question.type === 'button-group') {
        const buttonGroup = document.querySelector(`#q-${question.id}`);
        const selectedButton = buttonGroup.querySelector('.option-button.selected');
        if (selectedButton) {
            answers[question.id] = selectedButton.getAttribute('data-value');
        }
    } else if (question.type === 'budget-slider' || question.type === 'distance-slider') {
        const slider = document.querySelector(`#q-${question.id}`);
        if (slider) {
            answers[question.id] = slider.value;
        }
    } else {
        const input = document.querySelector(`#q-${question.id}`);
        if (input) {
            answers[question.id] = input.value;
        }
    }
}

function validateCurrentQuestion() {
    const question = questions[currentQuestion];

    if (question.type === 'time-range') {
        const startInput = document.querySelector(`#q-${question.id}-start`);
        const endInput = document.querySelector(`#q-${question.id}-end`);

        if (!startInput || !endInput) return false;

        const startTime = startInput.value;
        const endTime = endInput.value;

        // Validate that end time is after start time
        if (startTime >= endTime) {
            endInput.focus();
            endInput.style.borderColor = '#ef4444';
            setTimeout(() => {
                endInput.style.borderColor = '';
            }, 2000);
            alert('End time must be after start time!');
            return false;
        }

        return true;
    } else if (question.type === 'button-group') {
        const buttonGroup = document.querySelector(`#q-${question.id}`);
        const selectedButton = buttonGroup.querySelector('.option-button.selected');

        if (question.required && !selectedButton) {
            // Highlight all buttons briefly
            const buttons = buttonGroup.querySelectorAll('.option-button');
            buttons.forEach(btn => {
                btn.style.borderColor = '#ef4444';
                setTimeout(() => {
                    btn.style.borderColor = '';
                }, 2000);
            });
            return false;
        }

        return true;
    } else if (question.type === 'budget-slider' || question.type === 'distance-slider') {
        // Sliders always have a value, so they're always valid
        return true;
    } else {
        const input = document.querySelector(`#q-${question.id}`);

        if (question.required && (!input.value || input.value.trim() === '')) {
            input.focus();
            input.style.borderColor = '#ef4444';
            setTimeout(() => {
                input.style.borderColor = '';
            }, 2000);
            return false;
        }

        return true;
    }
}

function shouldShowQuestion(questionIndex) {
    const question = questions[questionIndex];
    if (!question.conditional) return true;
    if (question.showIf && typeof question.showIf === 'function') {
        return question.showIf(answers);
    }
    return true;
}

function nextQuestion() {
    if (!validateCurrentQuestion()) {
        return;
    }

    saveCurrentAnswer();

    // Find next visible question
    let nextIndex = currentQuestion + 1;
    while (nextIndex < questions.length && !shouldShowQuestion(nextIndex)) {
        nextIndex++;
    }

    if (nextIndex < questions.length) {
        currentQuestion = nextIndex;
        renderQuestion();
        updateProgress();
    } else {
        finishQuestionnaire();
    }
}

function previousQuestion() {
    if (currentQuestion > 0) {
        saveCurrentAnswer();

        // Find previous visible question
        let prevIndex = currentQuestion - 1;
        while (prevIndex >= 0 && !shouldShowQuestion(prevIndex)) {
            prevIndex--;
        }

        if (prevIndex >= 0) {
            currentQuestion = prevIndex;
            renderQuestion();
            updateProgress();
        }
    }
}

async function finishQuestionnaire() {
    saveCurrentAnswer();

    const generationMode = answers['generation-mode'] || 'manual';

    if (generationMode === 'smart') {
        // Smart Generation path
        await handleSmartGeneration();
    } else {
        // Manual Selection path (existing behavior)
        handleManualSelection();
    }
}

function handleManualSelection() {
    // Populate the explore page fields with answers
    startingAddressInput.value = answers['starting-address'] || '';
    interestsInput.value = answers['interests'] || '';

    // Map budget slider value (0-500) to budget slider (0-2)
    const budgetValue = parseInt(answers['budget'] || 100);
    let budgetIndex = 1; // default medium
    if (budgetValue <= 150) {
        budgetIndex = 0; // low
    } else if (budgetValue <= 300) {
        budgetIndex = 1; // medium
    } else {
        budgetIndex = 2; // high
    }
    budgetSlider.value = budgetIndex;
    budgetLabel.textContent = budgetLabels[budgetIndex];

    maxDistanceSelect.value = answers['max-distance'] || '30';
    travelModeSelect.value = answers['travel-mode'] || 'driving-car';

    // Close modal
    closeModal();

    // Auto-trigger search
    handleSearch();
}

async function handleSmartGeneration() {
    // Show loading in modal
    questionContainer.innerHTML = `
            <div class="loading-container">
                <div class="loading-spinner"></div>
                <h3>Generating Your Perfect Itinerary...</h3>
                <p>Our AI is crafting a personalized day plan just for you</p>
            </div>
        `;

    // Hide navigation buttons
    prevBtn.style.display = 'none';
    nextBtn.style.display = 'none';

    const timePeriod = answers['time-period'] || { start: '09:00', end: '17:00' };
    const interests = answers['interests'] ? answers['interests'].split(',').map(i => i.trim()).filter(i => i) : [];

    // Map budget slider value (0-500) to budget label (Low/Medium/High)
    const budgetValue = parseInt(answers['budget'] || 100);
    let budget = 'Medium';
    if (budgetValue <= 150) {
        budget = 'Low';
    } else if (budgetValue <= 300) {
        budget = 'Medium';
    } else {
        budget = 'High';
    }

    try {
        const response = await fetch('/api/plan-smart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('session_token')
            },
            body: JSON.stringify({
                starting_address: answers['starting-address'] || '',
                interests: interests,
                budget: budget,
                max_distance: parseFloat(answers['max-distance'] || 30),
                travel_mode: answers['travel-mode'] || 'driving-car',
                start_time: timePeriod.start,
                end_time: timePeriod.end
            })
        });

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        // Display the generated itinerary in the modal
        displayGeneratedItinerary(result);

    } catch (err) {
        questionContainer.innerHTML = `
                <div class="error-container">
                    <h3>❌ Oops! Something went wrong</h3>
                    <p>${err.message}</p>
                    <button class="nav-btn primary-btn" onclick="location.reload()">Try Again</button>
                </div>
            `;
    }
}

function displayGeneratedItinerary(result) {
    const itinerary = result.itinerary || [];
    const totalCost = result.total_cost || 0;
    const totalTime = result.total_time_hours || 0;
    const activityTime = result.total_activity_hours || 0;
    const travelTime = result.total_travel_hours || 0;

    let itineraryHTML = `
            <div class="generated-itinerary">
                <h3>🎉 Your Personalized Itinerary</h3>
                <div class="itinerary-summary">
                    <span class="summary-item">📍 ${itinerary.length} Activities</span>
                    <span class="summary-item">💰 Cost: $${totalCost.toFixed(2)}</span>
                    <span class="summary-item">🎯 Activity Time: ${Math.floor(activityTime)}h ${Math.round((activityTime % 1) * 60)}m</span>
                    <span class="summary-item">🚗 Travel Time: ${Math.floor(travelTime)}h ${Math.round((travelTime % 1) * 60)}m</span>
                    <span class="summary-item">⏱️ Total: ${Math.floor(totalTime)}h ${Math.round((totalTime % 1) * 60)}m</span>
                </div>
                <div class="itinerary-timeline">
        `;

    itinerary.forEach((item, index) => {
        // Alternate between two placeholder images
        const imageUrl = index % 2 === 0 ? '/static/images/image1.jfif' : '/static/images/image2.jpg';

        // Use matched_reason if available, fallback to reason
        const reasonText = item.matched_reason || item.reason || 'A great activity for your trip!';

        // Add relevance badge if score exists
        const relevanceScore = item.relevance_score || 0;
        const relevanceBadge = relevanceScore > 0 ? `
                <span class="timeline-relevance ${relevanceScore >= 80 ? 'excellent' : relevanceScore >= 60 ? 'good' : 'moderate'}">
                    ${relevanceScore}% Match
                </span>
            ` : '';

        const address = item.address || 'Address not available';

        itineraryHTML += `
                <div class="timeline-item">
                    <div class="timeline-marker"><img src="${imageUrl}" alt="Activity" class="timeline-thumbnail"></div>
                    <div class="timeline-content">
                        <div class="timeline-time">${item.time || 'TBD'}</div>
                        <div class="timeline-name">
                            ${item.name || 'Activity'}
                            ${relevanceBadge}
                        </div>
                        <div class="timeline-address">📍 ${address}</div>
                        <div class="timeline-details">
                            <span>⏱️ ${item.duration || 'N/A'}</span>
                            <span>💰 ${item.cost || 'Free'}</span>
                            ${item.travel_time_min ? `<span>🚗 ${item.travel_time_min} min travel</span>` : ''}
                        </div>
                        <div class="timeline-reason">💡 ${reasonText}</div>
                    </div>
                </div>
            `;
    });

    itineraryHTML += `
                </div>
                <div class="itinerary-actions">
                    <button class="nav-btn secondary-btn" id="regenerate-btn">← Regenerate</button>
                    <button class="nav-btn primary-btn" id="accept-itinerary-btn">Accept & View ✓</button>
                </div>
            </div>
        `;

    questionContainer.innerHTML = itineraryHTML;

    // Add event listeners
    document.getElementById('accept-itinerary-btn').addEventListener('click', () => {
        acceptGeneratedItinerary(result);
    });

    document.getElementById('regenerate-btn').addEventListener('click', () => {
        currentQuestion = 0;

        // Restore navigation buttons visibility
        if (prevBtn) prevBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'inline-block';

        renderQuestion();
        updateProgress();
    });
}

async function acceptGeneratedItinerary(result) {
    // Save answers before closing modal (closeModal clears the answers object)
    const savedAnswers = { ...answers };

    // Close modal
    closeModal();

    // Populate the explore page fields using saved answers
    startingAddressInput.value = savedAnswers['starting-address'] || '';
    interestsInput.value = savedAnswers['interests'] || '';

    // Map budget slider value (0-500) to budget slider (0-2)
    const budgetValue = parseInt(savedAnswers['budget'] || 100);
    let budgetIndex = 1; // default medium
    if (budgetValue <= 150) {
        budgetIndex = 0; // low
    } else if (budgetValue <= 300) {
        budgetIndex = 1; // medium
    } else {
        budgetIndex = 2; // high
    }
    budgetSlider.value = budgetIndex;
    budgetLabel.textContent = budgetLabels[budgetIndex];

    maxDistanceSelect.value = savedAnswers['max-distance'] || '30';
    travelModeSelect.value = savedAnswers['travel-mode'] || 'driving-car';

    // Store starting coords and weather
    if (result.starting_coords) {
        startingCoords = result.starting_coords;
    }
    currentTravelMode = savedAnswers['travel-mode'] || 'driving-car';

    // Display weather widget
    displayWeatherWidget(result.weather);

    // Clear current itinerary before adding AI-generated items
    itineraryItems = [];
    itineraryCardsContainer.innerHTML = '';

    // Add all AI-generated items to the itinerary sidebar
    const generatedItems = result.itinerary || [];
    generatedItems.forEach(item => {
        itineraryItems.push(item);
        createItineraryCard(item);
    });

    // Calculate routing for visual feedback on individual legs
    await updateItineraryRouting();

    // Use pre-calculated totals from backend (AI already calculated these accurately)
    // Set these AFTER updateItineraryRouting to ensure they don't get overwritten
    const totalCostEl = document.getElementById('total-cost');
    const totalTimeEl = document.getElementById('total-time');

    if (totalCostEl && result.total_cost !== undefined) {
        totalCostEl.textContent = `$${result.total_cost.toFixed(2)}`;
    }

    if (totalTimeEl && result.total_time_hours !== undefined) {
        const totalHours = result.total_time_hours;
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours % 1) * 60);
        totalTimeEl.textContent = `${hours} hr ${minutes} min`;
    }

    // Use pre-loaded activities to instantly display activity cards
    // (These were loaded in parallel with AI generation)
    preloadedActivities = result.all_activities || [];
    await handleSearch(true);

    // Show success message
    alert('✅ Itinerary loaded! You can now browse additional activities below and edit your itinerary.');
}

// Event Listeners

if (modalClose) {
    modalClose.addEventListener('click', closeModal);
}

if (nextBtn) {
    nextBtn.addEventListener('click', nextQuestion);
}

if (prevBtn) {
    prevBtn.addEventListener('click', previousQuestion);
}

// Close modal when clicking outside
if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Handle ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeModal();
    }
});

//saving itinerary button
const saveBtn = document.getElementById('save-itinerary-btn');

// Enable the save button if there are activities
const itineraryContainer = document.getElementById('itinerary-cards');
const observer = new MutationObserver(() => {
    saveBtn.disabled = itineraryContainer.children.length === 0;
});
observer.observe(itineraryContainer, { childList: true });

// Click handler
saveBtn.addEventListener('click', async () => {
    const activities = Array.from(itineraryContainer.children)
        .filter(card => !card.classList.contains('empty-itinerary-message'))
        .map(card => {
            const data = JSON.parse(card.dataset.itemId);
            return {
                id: data.id || null,
                name: data.name,
                cost: data.cost,
                duration: data.time,
                distance_km: data.distance_km,
                lat: data.lat,
                lng: data.lng
            };
        });

    if (activities.length === 0) {
        alert('Add some activities to your itinerary first!');
        return;
    }

    // Show saving state
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        const response = await fetch('/save-itinerary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('session_token')
            },
            body: JSON.stringify({
                starting_address: startingAddressInput.value || null,
                places: activities,
                budget: budgetSlider?.value || null,
                interests: interestsInput?.value?.split(',') || [],
                travel_mode: travelModeSelect?.value || 'driving',
                max_distance: maxDistanceSelect?.value || null
            })
        });

        const result = await response.json();

        if (result.error) {
            alert(result.error);
            saveBtn.textContent = originalText;
            saveBtn.disabled = false;
            return;
        }

        // Success!
        saveBtn.textContent = '✓ Saved!';
        saveBtn.style.background = '#8C9A6F';
        
        // Show success message
        if (window.mockMode) {
            alert(`Trip saved! (MOCK mode - trip_id: ${result.trip_id})`);
        } else {
            alert('Trip saved successfully! View it in Saved Trips.');
        }
        
        // Reset button after delay
        setTimeout(() => {
            saveBtn.textContent = originalText;
            saveBtn.style.background = '';
            saveBtn.disabled = false;
        }, 2000);

    } catch (err) {
        console.error(err);
        alert('Error saving itinerary: ' + err.message);
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
});

async function checkAndLoadEditTrip() {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (!editId) return;  // No edit param, skip loading

    const token = localStorage.getItem('session_token');
    if (!token) {
        alert('Please log in to edit a saved trip.');
        return;
    }

    try {
        const response = await fetch(`/api/get-trips`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success) throw new Error(data.error || "Failed to load trips.");

        const trip = data.trips.find(t => t._id === editId);
        if (!trip) throw new Error("Trip not found for editing.");

        // Replace itinerary state with loaded trip places
        itineraryItems = trip.places || [];

        // Render search results cards reflecting current itinerary state (optional)
        displayCards(itineraryItems, false);

        // Render itinerary sidebar cards
        itineraryCardsContainer.innerHTML = '';
        itineraryItems.forEach(place => createItineraryCard(place));

        // Populate filter and form inputs with trip data
        startingAddressInput.value = trip.starting_address || '';
        interestsInput.value = (trip.interests || []).join(', ');
        maxDistanceSelect.value = trip.max_distance || 30;
        budgetSlider.value = trip.budget || 0;
        travelModeSelect.value = trip.travel_mode || 'driving-car';

        // Store starting coordinates if available (add as needed)
        if (trip.starting_coords) {
            startingCoords = trip.starting_coords;
        }

        // Update routing visuals and totals based on loaded itinerary
        await updateItineraryRouting();
    } catch (err) {
        console.error("Error loading saved trip for editing:", err);
        alert(err.message);
    }
}

checkAndLoadEditTrip();

//login and register btn or logout button
const headerActions = document.querySelector('.header-actions');

function updateHeaderUI() {
    const token = localStorage.getItem('session_token');
    if (token) {
        headerActions.innerHTML = `
                <span>Welcome!</span>
                <button id="guided-setup-btn" class="btn-guided">Guided Setup</button>
                <button id="logout-btn" class="btn-secondary">LOG OUT</button>
            `;
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await fetch('/api/logout-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_token: token })
            });
            localStorage.removeItem('session_token');
            localStorage.removeItem('csrf_token');
            updateHeaderUI();
        });
    } else {
        headerActions.innerHTML = `
                <button id="guided-setup-btn" class="btn-guided">Guided Setup</button>
                <button class="btn-secondary"
                        onclick="window.location.href='/login';">LOG IN</button>
                <button class="btn-primary" 
                    onclick="window.location.href='/register';">SIGN UP</button>
            `;
    }

    document.getElementById('guided-setup-btn').addEventListener('click', openModal);;
}

updateHeaderUI();


// ============== AI FEATURES INTEGRATION ==============

// AI Chat state
let chatHistory = [];
let isChatOpen = false;

// Initialize AI Chat
function initAIChat() {
    const chatToggle = document.getElementById('ai-chat-toggle');
    const chatPanel = document.getElementById('ai-chat-panel');
    const chatClose = document.getElementById('chat-close');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const chatSuggestions = document.querySelectorAll('.suggestion-chip');
    
    if (!chatToggle) return;
    
    // Toggle chat panel
    chatToggle.addEventListener('click', () => {
        isChatOpen = !isChatOpen;
        chatPanel.classList.toggle('open', isChatOpen);
        if (isChatOpen) {
            chatInput.focus();
        }
    });
    
    chatClose.addEventListener('click', () => {
        isChatOpen = false;
        chatPanel.classList.remove('open');
    });
    
    // Send message
    chatSend.addEventListener('click', () => sendChatMessage());
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Quick suggestion chips
    chatSuggestions.forEach(chip => {
        chip.addEventListener('click', () => {
            chatInput.value = chip.dataset.message;
            sendChatMessage();
        });
    });
}

async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Add user message to UI
    chatMessages.innerHTML += `
        <div class="chat-message user">
            <div class="message-content">${escapeHtml(message)}</div>
        </div>
    `;
    chatInput.value = '';
    
    // Add to history
    chatHistory.push({ role: 'user', content: message });
    
    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    chatMessages.innerHTML += `
        <div class="chat-message assistant" id="${typingId}">
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    try {
        // Build context from current state
        const context = {
            location: document.getElementById('starting-address')?.value || null,
            interests: document.getElementById('interests')?.value?.split(',').map(i => i.trim()).filter(Boolean) || [],
            budget: ['low', 'medium', 'high'][parseInt(document.getElementById('budget')?.value || 0)],
            current_itinerary: itineraryItems || []
        };
        
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('session_token') || 'mock')
            },
            body: JSON.stringify({
                message: message,
                history: chatHistory.slice(-10),
                context: context
            })
        });
        
        const data = await response.json();
        
        // Remove typing indicator
        document.getElementById(typingId)?.remove();
        
        // Add assistant response
        chatMessages.innerHTML += `
            <div class="chat-message assistant">
                <div class="message-content">${escapeHtml(data.response || 'Sorry, I couldn\'t process that.')}</div>
            </div>
        `;
        
        // Add to history
        chatHistory.push({ role: 'assistant', content: data.response });
        
        // Handle suggestions if any
        if (data.suggestions && data.suggestions.length > 0) {
            const suggestionsHtml = data.suggestions.map(s => 
                `<button class="suggestion-chip chat-activity-suggestion" data-activity="${escapeHtml(s)}">${escapeHtml(s)}</button>`
            ).join('');
            chatMessages.innerHTML += `
                <div class="chat-message assistant">
                    <div class="message-content" style="background: transparent; padding: 5px 0;">
                        ${suggestionsHtml}
                    </div>
                </div>
            `;
            
            // Add click handlers for suggested activities
            document.querySelectorAll('.chat-activity-suggestion').forEach(btn => {
                btn.addEventListener('click', () => {
                    const activityName = btn.dataset.activity;
                    chatInput.value = `Tell me more about ${activityName}`;
                    sendChatMessage();
                });
            });
        }
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (err) {
        document.getElementById(typingId)?.remove();
        chatMessages.innerHTML += `
            <div class="chat-message assistant">
                <div class="message-content" style="color: #c00;">Sorry, I'm having trouble connecting. Please try again.</div>
            </div>
        `;
        console.error('Chat error:', err);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// ============== AI ACTIVITY SUMMARIES ==============

async function fetchActivitySummary(activity) {
    try {
        const interests = document.getElementById('interests')?.value?.split(',').map(i => i.trim()).filter(Boolean) || [];
        
        const response = await fetch('/api/ai/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activity: activity,
                interests: interests
            })
        });
        
        return await response.json();
    } catch (err) {
        console.error('Summary fetch error:', err);
        return null;
    }
}

function renderActivitySummary(summary, container) {
    if (!summary || !container) return;
    
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'activity-summary';
    summaryDiv.innerHTML = `
        <div class="summary-text">${escapeHtml(summary.summary)}</div>
        <div class="summary-highlights">
            ${(summary.highlights || []).map(h => `<span class="highlight-tag">${escapeHtml(h)}</span>`).join('')}
        </div>
        <div class="summary-best-for">Best for: ${escapeHtml(summary.best_for || 'Everyone')}</div>
    `;
    container.appendChild(summaryDiv);
}


// ============== AI ROUTE NARRATION ==============

let narrationEnabled = true;
let speechSynthesis = window.speechSynthesis;
let currentUtterance = null;

async function fetchRouteNarration() {
    if (!itineraryItems || itineraryItems.length === 0) return null;
    
    try {
        const response = await fetch('/api/ai/narration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itinerary: itineraryItems,
                starting_location: document.getElementById('starting-address')?.value || 'your location',
                travel_mode: currentTravelMode
            })
        });
        
        return await response.json();
    } catch (err) {
        console.error('Narration fetch error:', err);
        return null;
    }
}

function speakNarration(text) {
    if (!narrationEnabled || !speechSynthesis) return;
    
    // Cancel any current speech
    speechSynthesis.cancel();
    
    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.rate = 0.9;
    currentUtterance.pitch = 1;
    speechSynthesis.speak(currentUtterance);
}

function stopNarration() {
    if (speechSynthesis) {
        speechSynthesis.cancel();
    }
}


// ============== AI PREFERENCE TRACKING ==============

async function trackPreference(action, activity) {
    try {
        await fetch('/api/ai/preferences', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('session_token') || 'mock'),
                'X-Session-ID': getOrCreateSessionId()
            },
            body: JSON.stringify({
                action: action,
                activity: activity
            })
        });
    } catch (err) {
        console.error('Preference tracking error:', err);
    }
}

function getOrCreateSessionId() {
    let sessionId = localStorage.getItem('anon_session_id');
    if (!sessionId) {
        sessionId = 'anon_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('anon_session_id', sessionId);
    }
    return sessionId;
}

async function fetchPersonalizedRecommendations(availableActivities) {
    try {
        const response = await fetch('/api/ai/recommendations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (localStorage.getItem('session_token') || 'mock'),
                'X-Session-ID': getOrCreateSessionId()
            },
            body: JSON.stringify({
                current_itinerary: itineraryItems || [],
                available_activities: availableActivities
            })
        });
        
        return await response.json();
    } catch (err) {
        console.error('Recommendations fetch error:', err);
        return null;
    }
}


// ============== AI ALTERNATIVES ==============

async function fetchAlternatives(activity, allActivities) {
    try {
        const response = await fetch('/api/ai/alternatives', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activity: activity,
                all_activities: allActivities,
                count: 3
            })
        });
        
        return await response.json();
    } catch (err) {
        console.error('Alternatives fetch error:', err);
        return null;
    }
}

function showAlternativesTooltip(activity, container, allActivities) {
    // Check if tooltip already exists
    let tooltip = container.querySelector('.alternatives-tooltip');
    if (tooltip) {
        tooltip.classList.toggle('show');
        return;
    }
    
    // Create tooltip
    tooltip = document.createElement('div');
    tooltip.className = 'alternatives-tooltip';
    tooltip.innerHTML = '<div style="text-align: center; padding: 10px;">Loading alternatives...</div>';
    container.appendChild(tooltip);
    tooltip.classList.add('show');
    
    // Fetch and populate
    fetchAlternatives(activity, allActivities).then(data => {
        if (!data || !data.alternatives || data.alternatives.length === 0) {
            tooltip.innerHTML = '<div style="padding: 10px;">No alternatives found</div>';
            return;
        }
        
        tooltip.innerHTML = `
            <h4>Similar Activities</h4>
            ${data.alternatives.map((alt, i) => `
                <div class="alternative-item">
                    <div>
                        <div class="alternative-name">${escapeHtml(alt.name || 'Unknown')}</div>
                        <div class="alternative-reason">${escapeHtml(data.similarity_reasons?.[i] || '')}</div>
                    </div>
                    <button class="alternative-swap-btn" data-alt='${JSON.stringify(alt)}'>Swap</button>
                </div>
            `).join('')}
        `;
        
        // Add swap handlers
        tooltip.querySelectorAll('.alternative-swap-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const altActivity = JSON.parse(btn.dataset.alt);
                // Swap in itinerary
                const index = itineraryItems.findIndex(item => item.name === activity.name);
                if (index !== -1) {
                    itineraryItems[index] = altActivity;
                    rebuildItineraryCards();
                    updateItineraryRouting();
                    updateMapState(false);
                    tooltip.classList.remove('show');
                }
            });
        });
    });
    
    // Close on outside click
    document.addEventListener('click', function closeTooltip(e) {
        if (!tooltip.contains(e.target) && !container.contains(e.target)) {
            tooltip.classList.remove('show');
            document.removeEventListener('click', closeTooltip);
        }
    });
}


// ============== AI ROUTE OPTIMIZATION ==============

async function checkRouteOptimization() {
    if (!itineraryItems || itineraryItems.length < 2) return;
    
    try {
        const response = await fetch('/api/ai/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                itinerary: itineraryItems,
                starting_coords: startingCoords,
                travel_mode: currentTravelMode,
                context: {
                    current_time: new Date().toLocaleTimeString()
                }
            })
        });
        
        const data = await response.json();
        
        if (data.suggestions && data.suggestions.length > 0) {
            showOptimizationBanner(data);
        }
    } catch (err) {
        console.error('Optimization check error:', err);
    }
}

function showOptimizationBanner(optimizationData) {
    // Remove existing banner
    document.querySelector('.optimization-banner')?.remove();
    
    const firstSuggestion = optimizationData.suggestions[0];
    if (!firstSuggestion || firstSuggestion.type === 'tip' && firstSuggestion.savings_min === 0) {
        return; // No real optimization needed
    }
    
    const banner = document.createElement('div');
    banner.className = 'optimization-banner show';
    
    const iconMap = {
        'reorder': '🔄',
        'weather': '🌧️',
        'timing': '⏰',
        'tip': '💡'
    };
    
    banner.innerHTML = `
        <div class="optimization-header">
            <span class="optimization-icon">${iconMap[firstSuggestion.type] || '💡'}</span>
            <span class="optimization-title">AI Suggestion</span>
        </div>
        <div class="optimization-message">${escapeHtml(firstSuggestion.message)}</div>
        ${optimizationData.optimized_order ? `
            <div class="optimization-actions">
                <button class="optimization-apply-btn">Apply Optimization</button>
                <button class="optimization-dismiss-btn">Dismiss</button>
            </div>
        ` : `
            <div class="optimization-actions">
                <button class="optimization-dismiss-btn">Got it</button>
            </div>
        `}
    `;
    
    // Insert before itinerary cards
    const itineraryContainer = document.getElementById('itinerary-container');
    if (itineraryContainer) {
        itineraryContainer.insertBefore(banner, itineraryContainer.firstChild);
    }
    
    // Apply optimization handler
    banner.querySelector('.optimization-apply-btn')?.addEventListener('click', () => {
        if (optimizationData.optimized_order) {
            const newOrder = optimizationData.optimized_order.map(i => itineraryItems[i]);
            itineraryItems = newOrder;
            rebuildItineraryCards();
            updateItineraryRouting();
            updateMapState(false);
        }
        banner.remove();
    });
    
    // Dismiss handler
    banner.querySelector('.optimization-dismiss-btn')?.addEventListener('click', () => {
        banner.remove();
    });
}


// ============== ENHANCED ROUTE PLAYBACK WITH NARRATION ==============

async function playRouteAnimationWithNarration() {
    if (isPlayingRoute || !routeGeometry || routeGeometry.length < 2) {
        debugLog('MAP', 'Cannot play route: no geometry or already playing');
        return;
    }
    
    isPlayingRoute = true;
    const playBtn = document.getElementById('play-route-btn');
    if (playBtn) {
        playBtn.textContent = '⏹️ Stop';
        playBtn.classList.add('playing');
    }
    
    // Fetch narration
    const narration = await fetchRouteNarration();
    
    // Show narration controls
    showNarrationControls();
    
    // Speak intro
    if (narration && narration.intro) {
        speakNarration(narration.intro);
        await new Promise(r => setTimeout(r, 2000));
    }
    
    // Zoom to start
    map.flyTo({
        center: routeGeometry[0],
        zoom: 15,
        duration: 1000
    });
    
    await new Promise(r => setTimeout(r, 1200));
    
    // Animate along the route with narration
    const totalPoints = routeGeometry.length;
    const segmentSize = Math.floor(totalPoints / (itineraryItems.length + 1));
    let currentSegment = 0;
    
    for (let i = 0; i < totalPoints && isPlayingRoute; i++) {
        const point = routeGeometry[i];
        
        // Check if entering new segment
        const newSegment = Math.floor(i / segmentSize);
        if (newSegment !== currentSegment && narration?.segments?.[newSegment - 1]) {
            currentSegment = newSegment;
            const segment = narration.segments[newSegment - 1];
            updateNarrationText(segment.narration);
            speakNarration(segment.narration);
        }
        
        map.easeTo({
            center: point,
            zoom: 15 - (i / totalPoints) * 2,
            bearing: i > 0 ? getBearing(routeGeometry[i-1], point) : 0,
            pitch: 45,
            duration: 100
        });
        
        await new Promise(r => setTimeout(r, 80));
    }
    
    // Speak outro
    if (narration && narration.outro && isPlayingRoute) {
        speakNarration(narration.outro);
        updateNarrationText(narration.outro);
    }
    
    // Reset view
    if (isPlayingRoute) {
        map.flyTo({
            center: routeGeometry[routeGeometry.length - 1],
            zoom: 13,
            pitch: 0,
            bearing: 0,
            duration: 1500
        });
    }
    
    isPlayingRoute = false;
    if (playBtn) {
        playBtn.textContent = '▶️ Watch Trip';
        playBtn.classList.remove('playing');
    }
    hideNarrationControls();
}

function showNarrationControls() {
    let controls = document.getElementById('narration-controls');
    if (!controls) {
        controls = document.createElement('div');
        controls.id = 'narration-controls';
        controls.className = 'narration-controls';
        controls.innerHTML = `
            <div class="narration-text" id="narration-text">Starting your tour...</div>
            <div class="narration-toggle">
                <input type="checkbox" id="narration-enabled" ${narrationEnabled ? 'checked' : ''}>
                <label for="narration-enabled">🔊 Voice narration</label>
            </div>
        `;
        document.getElementById('map-section')?.appendChild(controls);
        
        document.getElementById('narration-enabled')?.addEventListener('change', (e) => {
            narrationEnabled = e.target.checked;
            if (!narrationEnabled) stopNarration();
        });
    }
    controls.classList.add('show');
}

function hideNarrationControls() {
    document.getElementById('narration-controls')?.classList.remove('show');
    stopNarration();
}

function updateNarrationText(text) {
    const el = document.getElementById('narration-text');
    if (el) el.textContent = text;
}


// Initialize AI features on page load
initAIChat();

});
