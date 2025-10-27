document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const startingAddressInput = document.getElementById('starting-address');
    const maxDistanceSelect = document.getElementById('max-distance');
    const interestsInput = document.getElementById('interests');
    const budgetSlider = document.getElementById('budget');
    const travelModeSelect = document.getElementById('travel-mode');
    const cardsContainer = document.getElementById('cards-container');
    const loadingMessage = document.getElementById('loading');

    // Infinite scroll state
    let allItineraryItems = [];
    let displayedCount = 0;
    const CARDS_PER_LOAD = 3;
    
    // Itinerary state
    let itineraryItems = [];
    const itineraryCardsContainer = document.getElementById('itinerary-cards');
    
    // Store starting coordinates and travel mode
    let startingCoords = null;
    let currentTravelMode = 'driving-car';

    // Budget slider label update
    const budgetLabel = document.querySelector('.budget-label');
    const budgetLabels = ['Low', 'Medium', 'High'];
    
    budgetSlider.addEventListener('input', (e) => {
        budgetLabel.textContent = budgetLabels[parseInt(e.target.value)];
    });

    // Search button click handler
    searchBtn.addEventListener('click', handleSearch);

    // Enter key handler for search input
    startingAddressInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    async function handleSearch() {
        const startingAddress = startingAddressInput.value.trim();
        const interests = interestsInput.value.split(',').map(i => i.trim()).filter(i => i);
        const maxDistance = parseFloat(maxDistanceSelect.value);
        const budgetValue = parseInt(budgetSlider.value);
        const budget = budgetLabels[budgetValue];
        const travelMode = travelModeSelect.value;
        
        currentTravelMode = travelMode;

        if (!startingAddress) {
            alert('Please enter a starting address');
            return;
        }

        loadingMessage.style.display = 'block';
        cardsContainer.innerHTML = '';
        
        itineraryItems = [];
        itineraryCardsContainer.innerHTML = '<p class="empty-itinerary-message">Add activities to your itinerary</p>';
        updateItineraryTotals();

        try {
            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    starting_address: startingAddress,
                    interests: interests,
                    budget: budget,
                    max_distance: maxDistance,
                    travel_mode: travelMode
                })
            });

            const result = await response.json();
            
            if (result.error) {
                alert(result.error);
                loadingMessage.style.display = 'none';
                return;
            }

            // Store starting coordinates
            startingCoords = result.starting_coords;
            
            displayCards(result.itinerary || []);

        } catch (err) {
            alert('Error: ' + err.message);
            loadingMessage.style.display = 'none';
        }
    }

    function displayCards(itinerary) {
        loadingMessage.style.display = 'none';
        cardsContainer.innerHTML = '';

        if (!itinerary || itinerary.length === 0) {
            cardsContainer.innerHTML = `
                <div class="empty-message">
                    <p>No activities found. Try adjusting your search criteria.</p>
                </div>
            `;
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }

        allItineraryItems = itinerary;
        displayedCount = 0;

        loadMoreCards();
        updateLoadMoreButton();
    }
    
    function updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('load-more-btn');
        
        if (!loadMoreBtn) {
            return;
        }
        
        if (displayedCount >= allItineraryItems.length) {
            loadMoreBtn.style.display = 'none';
        } else {
            loadMoreBtn.style.display = 'block';
        }
    }

    function loadMoreCards() {
        const cardsToDisplay = allItineraryItems.slice(
            displayedCount, 
            displayedCount + CARDS_PER_LOAD
        );

        if (cardsToDisplay.length === 0) {
            return;
        }

        cardsToDisplay.forEach((item, index) => {
            const cardIndex = displayedCount + index;
            const card = createActivityCard(item, cardIndex);
            cardsContainer.appendChild(card);
        });

        displayedCount += cardsToDisplay.length;
        updateLoadMoreButton();
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

        const description = item.reason || 'A great place to visit during your trip.';
        const shortDescription = description.substring(0, 120) + (description.length > 120 ? '...' : '');

        const emojis = ['🎨', '🏛️', '🌳', '🍽️', '🎭', '🎪', '🏔️', '🏖️', '🎪', '🎠', '🎯', '🏺', '🎬', '🎵', '🎸'];
        const emoji = emojis[index % emojis.length];
        
        // Display distance and travel time
        const distanceKm = item.distance_km || 0;
        const travelTimeMin = item.travel_time_min || 0;
        const distanceDisplay = distanceKm > 0 ? `${distanceKm} km • ${travelTimeMin} min away` : `${travelTimeMin} min away`;

        card.innerHTML = `
            <div class="card-image">
                ${emoji}
            </div>
            <div class="card-body">
                <div class="card-rating">
                    ${stars}
                </div>
                <h3 class="card-title">${item.name || 'Activity'}</h3>
                <p class="card-description">${shortDescription}</p>
                <div class="card-footer">
                    <div>
                        <div class="card-price">${item.cost || 'Free'}</div>
                        <div class="distance-info">📍 ${distanceDisplay}</div>
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
        
        createItineraryCard(item);
        
        // Recalculate routing for entire itinerary
        await updateItineraryRouting();
        
        const addBtn = card.querySelector('.add-btn');
        addBtn.textContent = 'ADDED';
        addBtn.disabled = true;
        addBtn.style.background = '#8C9A6F';
        
        const emptyMsg = itineraryCardsContainer.querySelector('.empty-itinerary-message');
        if (emptyMsg) {
            emptyMsg.style.display = 'none';
        }
    }
    
    function createItineraryCard(item) {
        const card = document.createElement('div');
        card.className = 'itinerary-card';
        card.setAttribute('data-item-id', JSON.stringify(item));
        
        const emojis = ['🎨', '🏛️', '🌳', '🍽️', '🎭', '🎪', '🏔️', '🏖️', '🎪', '🎠', '🎯', '🏺', '🎬', '🎵', '🎸'];
        const randomIndex = Math.floor(Math.random() * emojis.length);
        const emoji = emojis[randomIndex];
        
        const costText = item.cost || 'Free';
        const distanceKm = item.distance_km || 0;
        
        card.innerHTML = `
            <div class="itinerary-card-image">
                ${emoji}
            </div>
            <div class="itinerary-card-body">
                <div class="itinerary-card-name">${item.name || 'Activity'}</div>
                <div class="itinerary-card-details">${distanceKm} km • ${costText}</div>
                <div class="itinerary-card-details itinerary-route-info">Calculating route...</div>
                <button class="itinerary-remove-btn" data-remove-id="${JSON.stringify(item)}">Remove</button>
            </div>
        `;
        
        const removeBtn = card.querySelector('.itinerary-remove-btn');
        removeBtn.addEventListener('click', () => removeFromItinerary(item, card));
        
        itineraryCardsContainer.appendChild(card);
    }
    
    async function removeFromItinerary(item, card) {
        itineraryItems = itineraryItems.filter(i => JSON.stringify(i) !== JSON.stringify(item));
        
        card.remove();
        
        // Recalculate routing for remaining items
        await updateItineraryRouting();
        
        reEnableCardInMainView(item);
        
        if (itineraryItems.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'empty-itinerary-message';
            emptyMsg.textContent = 'Add activities to your itinerary';
            itineraryCardsContainer.appendChild(emptyMsg);
        }
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    waypoints: waypoints,
                    travel_mode: currentTravelMode
                })
            });
            
            const routeData = await response.json();
            
            if (routeData.error) {
                console.error('Routing error:', routeData.error);
                updateItineraryTotals();
                return;
            }
            
            // Update individual leg information in cards
            const legs = routeData.legs || [];
            const itineraryCards = itineraryCardsContainer.querySelectorAll('.itinerary-card');
            
            itineraryCards.forEach((card, index) => {
                const routeInfo = card.querySelector('.itinerary-route-info');
                if (routeInfo && legs[index]) {
                    const leg = legs[index];
                    routeInfo.textContent = `${leg.distance_km.toFixed(1)} km • ${Math.round(leg.time_min)} min from previous`;
                }
            });
            
            // Update totals with cumulative data
            updateItineraryTotals(routeData);
            
        } catch (err) {
            console.error('Failed to calculate route:', err);
            updateItineraryTotals();
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
});