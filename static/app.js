document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('trip-form');
    const itineraryList = document.getElementById('itinerary-list');
    const weatherInfo = document.getElementById('weather-info');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const data = {
            starting_address: formData.get('starting-address'),
            interests: formData.get('interests').split(',').map(i => i.trim()).filter(i => i),
            budget: formData.get('budget'),
            max_distance: parseFloat(formData.get('max-distance')) || 30,
            travel_mode: formData.get('travel-mode')
        };

        try {
            const response = await fetch('/api/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (result.error) {
                alert(result.error);
                return;
            }

            // Display weather information
            const weather = result.weather;
            const weatherDisplay = weather.has_poor_weather ? 
                `☁️ ${weather.summary} • ${weather.temp_f}°F • ⚠️ ${weather.max_precip_probability}% chance of rain` :
                `☀️ ${weather.summary} • ${weather.temp_f}°F`;
            weatherInfo.textContent = `Today's Weather: ${weatherDisplay}`;
            weatherInfo.style.padding = '0.75rem';
            weatherInfo.style.background = weather.has_poor_weather ? '#fff3cd' : '#d1ecf1';
            weatherInfo.style.borderRadius = '8px';
            weatherInfo.style.marginBottom = '1rem';

            // Display LLM-generated itinerary
            itineraryList.innerHTML = '';
            result.itinerary.forEach(item => {
                const div = document.createElement('div');
                const address = item.address || 'Address not available';
                
                // Weather warning if applicable
                const weatherWarning = item.weather_warning ? 
                    `<div style="background: #fff3cd; padding: 0.5rem; border-radius: 6px; margin: 0.5rem 0; font-size: 0.9em;">
                        ${item.weather_warning}
                    </div>` : '';
                
                div.innerHTML = `<strong>${item.time}</strong>: ${item.name} (${item.cost})<br>
                    <em style="font-size: 0.9em; color: #666;">📍 ${address}</em><br>
                    ${weatherWarning}
                    ${item.reason} (Travel: ${item.travel_time_min} min)`;
                div.style.marginBottom = '1rem';
                div.style.padding = '1rem';
                div.style.background = item.weather_warning ? '#fff9e6' : '#f8f9fa';
                div.style.borderRadius = '8px';
                div.style.borderLeft = item.weather_warning ? '4px solid #ffc107' : '4px solid #8C9A6F';
                itineraryList.appendChild(div);
            });
        } catch (err) {
            alert('Error: ' + err.message);
        }
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
            title: 'What\'s your budget level?',
            description: 'This helps us suggest activities that fit your spending preferences',
            type: 'select',
            options: [
                { value: 'low', label: 'Low - Budget-friendly options' },
                { value: 'medium', label: 'Medium - Balanced options' },
                { value: 'high', label: 'High - Premium experiences' }
            ],
            required: true
        },
        {
            id: 'max-distance',
            title: 'How far are you willing to travel?',
            description: 'Maximum distance in miles from your starting location',
            type: 'number',
            placeholder: 'e.g., 30',
            hint: 'Default is 30 miles if left empty',
            required: false
        },
        {
            id: 'travel-mode',
            title: 'How will you be traveling?',
            description: 'Choose your preferred mode of transportation',
            type: 'select',
            options: [
                { value: 'driving-car', label: '🚗 Car' },
                { value: 'cycling-regular', label: '🚴 Bike' },
                { value: 'foot-walking', label: '🚶 Walking' }
            ],
            required: true
        }
    ];

    function openModal() {
        modal.classList.add('active');
        currentQuestion = 0;
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
        } else if (question.type === 'select') {
            const savedValue = answers[question.id] || question.options[0].value;
            inputHTML = `
                <select id="q-${question.id}" ${question.required ? 'required' : ''}>
                    ${question.options.map(opt => 
                        `<option value="${opt.value}" ${savedValue === opt.value ? 'selected' : ''}>${opt.label}</option>`
                    ).join('')}
                </select>
            `;
        }

        questionContainer.innerHTML = `
            <div class="question">
                <h3>${question.title}</h3>
                <p>${question.description}</p>
                ${inputHTML}
            </div>
        `;

        // Focus on input
        setTimeout(() => {
            const input = document.querySelector(`#q-${question.id}`);
            if (input && question.type !== 'select') {
                input.focus();
            }
        }, 100);

        // Handle Enter key
        const input = document.querySelector(`#q-${question.id}`);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && currentQuestion < questions.length - 1) {
                    e.preventDefault();
                    nextQuestion();
                }
            });
        }
    }

    function updateProgress() {
        const progress = ((currentQuestion + 1) / questions.length) * 100;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Question ${currentQuestion + 1} of ${questions.length}`;

        // Update button states
        prevBtn.disabled = currentQuestion === 0;
        
        if (currentQuestion === questions.length - 1) {
            nextBtn.textContent = 'Finish & Generate';
            nextBtn.classList.add('finish-btn');
        } else {
            nextBtn.textContent = 'Next';
            nextBtn.classList.remove('finish-btn');
        }
    }

    function saveCurrentAnswer() {
        const question = questions[currentQuestion];
        const input = document.querySelector(`#q-${question.id}`);
        
        if (input) {
            answers[question.id] = input.value;
        }
    }

    function validateCurrentQuestion() {
        const question = questions[currentQuestion];
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

    function nextQuestion() {
        if (!validateCurrentQuestion()) {
            return;
        }

        saveCurrentAnswer();

        if (currentQuestion < questions.length - 1) {
            currentQuestion++;
            renderQuestion();
            updateProgress();
        } else {
            finishQuestionnaire();
        }
    }

    function previousQuestion() {
        if (currentQuestion > 0) {
            saveCurrentAnswer();
            currentQuestion--;
            renderQuestion();
            updateProgress();
        }
    }

    function finishQuestionnaire() {
        saveCurrentAnswer();

        // Populate the main form with answers
        document.getElementById('starting-address').value = answers['starting-address'] || '';
        document.getElementById('interests').value = answers['interests'] || '';
        document.getElementById('budget').value = answers['budget'] || 'medium';
        document.getElementById('max-distance').value = answers['max-distance'] || '30';
        document.getElementById('travel-mode').value = answers['travel-mode'] || 'driving-car';

        // Close modal
        closeModal();

        // Auto-submit the form
        form.dispatchEvent(new Event('submit'));
    }

    // Event Listeners
    guidedSetupBtn.addEventListener('click', openModal);
    modalClose.addEventListener('click', closeModal);
    nextBtn.addEventListener('click', nextQuestion);
    prevBtn.addEventListener('click', previousQuestion);

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Handle ESC key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });
});
