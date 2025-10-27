document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('search-btn');
    const startingAddressInput = document.getElementById('starting-address');
    const maxDistanceSelect = document.getElementById('max-distance');
    const interestsInput = document.getElementById('interests');
    const budgetSlider = document.getElementById('budget');
    const travelModeSelect = document.getElementById('travel-mode');
    const cardsContainer = document.getElementById('cards-container');
    const loadingMessage = document.getElementById('loading');

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

    async function handleSearch(usePreloaded = false) {
        // If we have preloaded activities from AI generation, use those
        if (usePreloaded && preloadedActivities) {
            displayCards(preloadedActivities);
            preloadedActivities = null; // Clear after use
            return;
        }
        
        const startingAddress = startingAddressInput.value.trim();
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

        try {
            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            
            if (result.error) {
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
            
            // Display weather widget
            displayWeatherWidget(result.weather);
            
            displayCards(result.itinerary || []);

        } catch (err) {
            alert('Error: ' + err.message);
            loadingMessage.style.display = 'none';
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
        loadingMessage.style.display = 'none';
        
        if (!append) {
            cardsContainer.innerHTML = '';
        }

        if (!itinerary || itinerary.length === 0) {
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
        
        updateLoadMoreButton();
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
                headers: { 'Content-Type': 'application/json' },
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
                headers: { 'Content-Type': 'application/json' },
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
    if (guidedSetupBtn) {
        guidedSetupBtn.addEventListener('click', openModal);
    }
    
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
});