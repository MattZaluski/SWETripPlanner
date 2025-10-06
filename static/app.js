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

            // Display mock weather (for completeness)
            const weather = result.weather;
            weatherInfo.textContent = `Weather (Mock): ${weather.summary}, Temp: ${weather.temp_f}°F, Precip: ${weather.precip}mm`;

            // Display LLM-generated itinerary
            itineraryList.innerHTML = '';
            result.itinerary.forEach(item => {
                const div = document.createElement('div');
                div.innerHTML = `<strong>${item.time}</strong>: ${item.name} (${item.cost}) - ${item.reason} (Travel: ${item.travel_time_min} min)`;
                itineraryList.appendChild(div);
            });
        } catch (err) {
            alert('Error: ' + err.message);
        }
    });
});
