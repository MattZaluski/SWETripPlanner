import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai

load_dotenv()

MOCK = os.getenv("MOCK", "true").lower() == "true"
GEOAPIFY_KEY = os.getenv("GEOAPIFY_API_KEY")
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyDW7M2_HtcbiA3FaOy1waVpqrmCl9CUXWY')
genai.configure(api_key=GEMINI_API_KEY)

# --- Keep your old mocks for quick fallback/testing ---
MOCK_PLACES = [
    {"id": "p1", "name": "Museum of Stuff", "lat": 42.36, "lng": -71.06, "type": "museum", "cost": "low", "hours": "10-17"},
    {"id": "p2", "name": "Sunny Park", "lat": 42.37, "lng": -71.05, "type": "park", "cost": "free", "hours": "6-20"},
    {"id": "p3", "name": "Joe's Diner", "lat": 42.355, "lng": -71.07, "type": "restaurant", "cost": "low", "hours": "7-21"},
]

MOCK_WEATHER = {"summary": "clear", "temp_f": 65, "precip": 0}
MOCK_TRAVEL_TIMES = {"p1": 10, "p2": 15, "p3": 20}

# ---------------- Geoapify helpers ----------------

def geocode_address(address):
    """
    Uses Geoapify Forward Geocoding to resolve an address to (lat, lon).
    """
    if not GEOAPIFY_KEY:
        raise Exception("GEOAPIFY_API_KEY not set in .env")
    url = "https://api.geoapify.com/v1/geocode/search"
    params = {
        "text": address,
        "limit": 1,
        "apiKey": GEOAPIFY_KEY
    }
    r = requests.get(url, params=params, timeout=10)
    if not r.ok:
        raise Exception(f"Geoapify geocode error: {r.status_code} {r.text}")
    data = r.json()
    features = data.get("features", [])
    if not features:
        raise Exception("Geocoding returned no results for address: " + address)
    props = features[0].get("properties", {})
    lat = props.get("lat") or props.get("latitude") or features[0].get("geometry", {}).get("coordinates", [None, None])[1]
    lon = props.get("lon") or props.get("longitude") or features[0].get("geometry", {}).get("coordinates", [None, None])[0]
    if lat is None or lon is None:
        raise Exception("Failed to extract coordinates from geocode response")
    return float(lat), float(lon)

def _map_interests_to_categories(interests):
    """
    Simple mapping of common free-text interests to Geoapify category keys.
    Extend this map as you need.
    """
    m = {
        "restaurant": "catering.restaurant",
        "food": "catering",
        "park": "leisure.park",
        "museum": "entertainment.museum",
        "cafe": "catering.cafe",
        "bar": "catering.bar",
        "shopping": "commercial",
        "beach": "leisure.beach",
        "trail": "leisure",
        "hike": "leisure",
        "attraction": "tourism.attraction",
        "zoo": "entertainment.zoo",
        "historic": "tourism.museum",
        "brewery": "catering.brewery"
    }
    cats = []
    for it in interests:
        key = it.strip().lower()
        if key in m:
            cats.append(m[key])
    # deduplicate
    cats = list(dict.fromkeys(cats))
    return cats

def fetch_places_from_geoapify(lat, lng, interests, max_distance, budget):
    """
    Query Geoapify Places API.
    Returns list of places in the same shape as your mock (id, name, lat, lng, type, cost, hours).
    - categories param is required by Geoapify, so we map interests to categories (fallback to defaults).
    - uses circle filter centered at lon,lat with radius meters.
    """
    if not GEOAPIFY_KEY:
        raise Exception("GEOAPIFY_API_KEY not set in .env")

    # convert miles to meters
    try:
        radius_m = int(float(max_distance) * 1609.344)
    except Exception:
        radius_m = 30000  # fallback to 30km if bad input

    # build categories param
    cats = _map_interests_to_categories(interests or [])
    if not cats:
        # fallback categories if we can't map anything
        cats = ["tourism.attraction", "catering.restaurant", "leisure.park"]
    categories_param = ",".join(cats)

    base_url = "https://api.geoapify.com/v2/places"
    # Geoapify expects filter in format: circle:lon,lat,radiusMeters
    filter_param = f"circle:{lng},{lat},{radius_m}"
    params = {
        "categories": categories_param,
        "filter": filter_param,
        "bias": f"proximity:{lng},{lat}",
        "limit": 20,
        "apiKey": GEOAPIFY_KEY
    }

    r = requests.get(base_url, params=params, timeout=10)
    if not r.ok:
        raise Exception(f"Geoapify Places API error: {r.status_code} {r.text}")

    data = r.json()
    features = data.get("features", [])
    places = []
    for feat in features:
        p = feat.get("properties", {})
        geometry = feat.get("geometry", {})
        coords = geometry.get("coordinates", [None, None])
        lon_p, lat_p = (coords[0], coords[1]) if coords and len(coords) >= 2 else (p.get("lon"), p.get("lat"))
        # try to find categories names or keys
        cat_names = []
        if p.get("categories"):
            # Geoapify categories in properties may be list of dicts with 'name' or 'name_en'
            for c in p.get("categories"):
                if isinstance(c, dict):
                    nm = c.get("name") or c.get("name_en") or c.get("key")
                    if nm:
                        cat_names.append(nm)
                else:
                    cat_names.append(str(c))
        type_str = ", ".join(cat_names) if cat_names else p.get("formatted", "") or "N/A"

        # Hours/price: Places returns limited info; Place Details API gives more.
        hours = p.get("opening_hours") or p.get("hours") or "N/A"
        # price: there may be 'price' or 'price_level' or use conditions; fallback Unknown
        cost = p.get("price") or p.get("price_level") or p.get("fee") or "Unknown"

        place_obj = {
            "id": p.get("place_id") or p.get("osm_id") or p.get("xid") or p.get("id") or str(p.get("lat")) + "_" + str(p.get("lon")),
            "name": p.get("name") or p.get("formatted") or "Unknown",
            "lat": float(lat_p) if lat_p is not None else None,
            "lng": float(lon_p) if lon_p is not None else None,
            "type": type_str,
            "cost": cost,
            "hours": hours
        }
        places.append(place_obj)

    return places

def calculate_route(waypoints, travel_mode):
    """
    Calculate routing data between multiple waypoints using Geoapify Routing API.
    
    Args:
        waypoints: List of (lat, lng) tuples representing waypoints in order
        travel_mode: One of 'drive', 'bicycle', 'walk' (Geoapify format)
        
    Returns:
        Dictionary with route information including:
        - total_distance_km: Total distance in kilometers
        - total_time_min: Total time in minutes
        - legs: List of leg data (distance and time for each segment)
    """
    if not GEOAPIFY_KEY:
        raise Exception("GEOAPIFY_API_KEY not set in .env")
    
    if len(waypoints) < 2:
        return {
            "total_distance_km": 0,
            "total_time_min": 0,
            "legs": []
        }
    
    # Convert travel mode from our format to Geoapify format
    mode_mapping = {
        "driving-car": "drive",
        "cycling-regular": "bicycle",
        "foot-walking": "walk"
    }
    geoapify_mode = mode_mapping.get(travel_mode, "drive")
    
    # Format waypoints as lat,lng|lat,lng|...
    waypoints_str = "|".join([f"{lat},{lng}" for lat, lng in waypoints])
    
    url = "https://api.geoapify.com/v1/routing"
    params = {
        "waypoints": waypoints_str,
        "mode": geoapify_mode,
        "apiKey": GEOAPIFY_KEY
    }
    
    try:
        r = requests.get(url, params=params, timeout=15)
        if not r.ok:
            raise Exception(f"Geoapify Routing API error: {r.status_code} {r.text}")
        
        data = r.json()
        
        # Extract route information
        features = data.get("features", [])
        if not features:
            raise Exception("No route found")
        
        properties = features[0].get("properties", {})
        
        # Get total distance (in meters) and time (in seconds)
        total_distance_m = properties.get("distance", 0)
        total_time_s = properties.get("time", 0)
        
        # Convert to km and minutes
        total_distance_km = total_distance_m / 1000
        total_time_min = total_time_s / 60
        
        # Extract leg information
        legs = []
        legs_data = properties.get("legs", [])
        for leg in legs_data:
            leg_distance_m = leg.get("distance", 0)
            leg_time_s = leg.get("time", 0)
            legs.append({
                "distance_km": leg_distance_m / 1000,
                "time_min": leg_time_s / 60
            })
        
        return {
            "total_distance_km": round(total_distance_km, 2),
            "total_time_min": round(total_time_min, 1),
            "legs": legs
        }
    
    except Exception as e:
        print(f"Routing error: {e}")
        # Return fallback data
        return {
            "total_distance_km": 0,
            "total_time_min": 0,
            "legs": []
        }

def calculate_travel_time_from_start(start_lat, start_lng, places, travel_mode):
    """
    Calculate travel time and distance from starting point to each place.
    Updates each place dict with travel_time_min and distance_km.
    """
    if not places:
        return places
    
    for place in places:
        if place.get("lat") is None or place.get("lng") is None:
            place["travel_time_min"] = 0
            place["distance_km"] = 0
            continue
        
        # Calculate route from start to this place
        waypoints = [(start_lat, start_lng), (place["lat"], place["lng"])]
        route_data = calculate_route(waypoints, travel_mode)
        
        place["travel_time_min"] = round(route_data["total_time_min"])
        place["distance_km"] = route_data["total_distance_km"]
    
    return places

# ---------------- existing LLM code ----------------

def call_gemini(messages, temperature=0.7):
    """
    Call Google's Gemini API as a fallback.
    Converts OpenAI message format to Gemini format.
    """
    try:
        # Initialize Gemini model
        model = genai.GenerativeModel('gemini-2.0-flash-exp')
        
        # Convert OpenAI messages to Gemini format
        # Combine system and user messages into a single prompt
        prompt_parts = []
        for msg in messages:
            if msg['role'] == 'system':
                prompt_parts.append(f"System Instructions: {msg['content']}")
            elif msg['role'] == 'user':
                prompt_parts.append(msg['content'])
        
        full_prompt = "\n\n".join(prompt_parts)
        
        # Generate response
        response = model.generate_content(
            full_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=temperature,
            )
        )
        
        # Create a response object compatible with OpenAI format
        class GeminiResponse:
            def __init__(self, text):
                self.choices = [type('obj', (object,), {
                    'message': type('obj', (object,), {
                        'content': text
                    })()
                })()]
        
        return GeminiResponse(response.text)
    
    except Exception as e:
        print(f"Gemini API error: {str(e)}")
        raise e

def call_llm_with_fallback(model, messages, temperature=0.7):
    """
    Helper function to call OpenAI with fallback to Google Gemini if the primary model fails.
    """
    try:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature
        )
        return response
    except Exception as e:
        error_msg = str(e)
        print(f"Error with {model}: {error_msg}")
        
        # Fallback to Gemini
        print(f"Falling back to Google Gemini (gemini-2.0-flash-exp)...")
        try:
            response = call_gemini(messages, temperature)
            print("Gemini fallback successful!")
            return response
        except Exception as fallback_error:
            print(f"Gemini fallback also failed: {str(fallback_error)}")
            raise fallback_error

def call_llm(prefs, places, weather, travel_times):
    prompt = f"""
    User preferences: {prefs}
    Available places: {places}
    Weather: {weather}
    Travel times (in minutes): {travel_times}
    Generate a polished day trip itinerary: Rank and filter places based on interests, budget, weather (prefer indoor if rainy), and travel times. Create a sequential list starting at 9AM, with 1-2 hours per stop, reasons for each, and estimates for time/cost.
    Generate 10-12 activities/places for a full day itinerary, creating multiple options for different times of day.
    Output as a JSON list of objects, where each object has 'time', 'name', 'reason', 'cost', and 'travel_time_min' fields.
    Example: [
        {{"time": "9:00 AM", "name": "Place Name", "reason": "Why this fits", "cost": "low", "travel_time_min": 10}}
    ]
    Return only the JSON list, no additional text or markdown.
    """
    
    messages = [
        {"role": "system", "content": "You are a trip planner AI. Respond with valid JSON only."},
        {"role": "user", "content": prompt}
    ]
    
    response = call_llm_with_fallback("gpt-4o-mini", messages, temperature=0.7)
    
    try:
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM response as JSON: {str(e)}")

def score_activities_with_llm(prefs, places):
    """
    Use LLM to score each activity's relevance to user preferences and provide reasoning.
    Returns a dict mapping place names to {relevance_score, matched_reason}.
    """
    prompt = f"""
    You are an expert trip advisor analyzing activities for a traveler.
    
    User Preferences:
    - Interests: {prefs.get('interests', [])}
    - Budget: {prefs.get('budget', 'medium')}
    - Travel Mode: {prefs.get('travel_mode', 'driving-car')}
    
    Available Activities:
    {json.dumps([{
        'name': p.get('name'),
        'type': p.get('type'),
        'cost': p.get('cost'),
        'hours': p.get('hours'),
        'distance_km': p.get('distance_km', 0),
        'travel_time_min': p.get('travel_time_min', 0)
    } for p in places[:20]], indent=2)}
    
    TASK:
    For EACH activity listed above, provide:
    1. A relevance score (0-100) indicating how well it matches the user's preferences
    2. A brief, engaging reason (1-2 sentences) explaining why this activity is a good match
    
    SCORING CRITERIA:
    - Interest alignment: Does it match their stated interests? (50 points)
    - Budget compatibility: Does the cost fit their budget level? (20 points)
    - Accessibility: Is the travel distance/time reasonable? (15 points)
    - Uniqueness/Quality: Is it a notable or special experience? (15 points)
    
    OUTPUT FORMAT:
    Return ONLY a JSON object mapping activity names to their scores and reasons:
    {{
        "Activity Name 1": {{
            "relevance_score": 85,
            "matched_reason": "This museum perfectly aligns with your interest in art and culture, offering world-class exhibits at an affordable price point."
        }},
        "Activity Name 2": {{
            "relevance_score": 72,
            "matched_reason": "A beautiful outdoor space ideal for relaxation, with free admission that fits your budget-conscious approach."
        }}
    }}
    
    IMPORTANT:
    - Score ALL activities provided
    - Be specific in reasons, referencing their actual interests
    - Keep reasons concise and enthusiastic
    - Return ONLY the JSON object, no markdown, no extra text
    """
    
    try:
        messages = [
            {"role": "system", "content": "You are an expert trip advisor AI. Analyze activities and provide relevance scores with compelling reasons. Always respond with valid JSON only."},
            {"role": "user", "content": prompt}
        ]
        
        response = call_llm_with_fallback("gpt-4o-mini", messages, temperature=0.7)
        
        content = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        
        return json.loads(content)
    except Exception as e:
        print(f"Error scoring activities with LLM: {e}")
        # Return default scores if LLM fails
        return {place['name']: {"relevance_score": 50, "matched_reason": "This activity offers a great local experience."} for place in places[:20]}

def call_llm_smart(prefs, places, weather, start_time, end_time):
    """
    Enhanced LLM call for smart generation with realistic durations and time-based scheduling.
    """
    prompt = f"""
    You are an expert trip planner creating a detailed, time-optimized itinerary.
    
    User preferences: {prefs}
    Available places: {places}
    Weather: {weather}
    Time window: {start_time} to {end_time}
    
    INSTRUCTIONS:
    1. Create a complete itinerary that fits within the time window ({start_time} to {end_time})
    2. Assign realistic durations for each activity:
       - Museums/Galleries: 1.5-2.5 hours
       - Restaurants/Dining: 1-1.5 hours
       - Parks/Outdoor spaces: 0.5-1.5 hours
       - Shopping: 1-2 hours
       - Cafes/Coffee: 0.5-1 hour
       - Entertainment venues: 2-3 hours
       - Historic sites: 1-2 hours
    3. Select activities that match the user's interests and budget
    4. Space activities to account for travel time between locations
    5. Include specific costs:
       - Use actual prices from the places data if available
       - Otherwise, estimate realistic costs based on the activity type and budget level
       - Format as "$XX.XX" for paid activities or "Free" for free activities
    6. Provide thoughtful reasons why each activity was selected
    7. Create a balanced day with variety (mix of indoor/outdoor, active/relaxing, cultural/dining)
    
    OUTPUT FORMAT:
    Return ONLY a JSON list of activity objects with these exact fields:
    - "time": Start time in "HH:MM AM/PM" format
    - "name": Activity/place name (must match a place from the available places)
    - "duration": Duration as "X.X hours" or "XX minutes"
    - "cost": Specific cost as "$XX.XX" or "Free"
    - "reason": Brief explanation (1-2 sentences) why this activity fits the user's preferences
    - "travel_time_min": Travel time to this location from the previous one (use data from places if available, otherwise estimate)
    
    Example:
    [
        {{"time": "9:00 AM", "name": "Museum of Art", "duration": "2 hours", "cost": "$25.00", "reason": "Perfect start to explore your interest in art and culture with world-class exhibitions.", "travel_time_min": 15}},
        {{"time": "11:30 AM", "name": "Central Park", "duration": "1 hour", "cost": "Free", "reason": "A relaxing outdoor break to enjoy nature between museum visits.", "travel_time_min": 10}}
    ]
    
    IMPORTANT: 
    - Ensure activities fit within the time window
    - Account for travel time between activities
    - Return ONLY the JSON array, no markdown, no extra text
    - Make sure the last activity ends before {end_time}
    """
    
    messages = [
        {"role": "system", "content": "You are an expert trip planner AI. You create detailed, realistic itineraries. Always respond with valid JSON only, no markdown formatting."},
        {"role": "user", "content": prompt}
    ]
    
    response = call_llm_with_fallback("gpt-4o-mini", messages, temperature=0.7)
    
    try:
        content = response.choices[0].message.content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM response as JSON: {str(e)}")

def plan_trip(data):
    prefs = {
        "starting_address": data.get("starting_address", "Boston, MA"),
        "interests": data.get("interests", []),
        "budget": data.get("budget", "low"),
        "max_distance": data.get("max_distance", 30),
        "travel_mode": data.get("travel_mode", "driving-car")
    }
    if MOCK:
        places = MOCK_PLACES
        weather = MOCK_WEATHER
        travel_times = MOCK_TRAVEL_TIMES
        lat, lng = 42.36, -71.06
    else:
        # resolve starting address to coords
        lat, lng = geocode_address(prefs["starting_address"])
        places = fetch_places_from_geoapify(
            lat, lng,
            interests=prefs["interests"],
            max_distance=prefs["max_distance"],
            budget=prefs["budget"]
        )
        
        # Calculate travel times from starting point to each place
        places = calculate_travel_time_from_start(lat, lng, places, prefs["travel_mode"])
        
        # TODO: swap in real weather API as needed
        weather = MOCK_WEATHER
        travel_times = {place['id']: place.get('travel_time_min', 10) for place in places}
    
    # Score activities with LLM to get relevance scores and matched reasons
    activity_scores = score_activities_with_llm(prefs, places)
    
    # Add relevance scores and matched reasons to each place
    for place in places:
        place_name = place.get('name')
        if place_name in activity_scores:
            place['relevance_score'] = activity_scores[place_name].get('relevance_score', 50)
            place['matched_reason'] = activity_scores[place_name].get('matched_reason', 'A great local experience.')
        else:
            place['relevance_score'] = 50
            place['matched_reason'] = 'An interesting activity to explore.'
    
    # Sort places by relevance score (highest first)
    places_sorted = sorted(places, key=lambda x: x.get('relevance_score', 0), reverse=True)
    
    polished_itinerary = call_llm(prefs, places_sorted, weather, travel_times)
    
    # Add lat/lng and distance info to itinerary items by matching names
    for item in polished_itinerary:
        matching_place = next((p for p in places_sorted if p['name'] == item['name']), None)
        if matching_place:
            item['lat'] = matching_place.get('lat')
            item['lng'] = matching_place.get('lng')
            item['distance_km'] = matching_place.get('distance_km', 0)
    
    return {
        "itinerary": polished_itinerary,
        "weather": weather,
        "places": places_sorted,
        "starting_coords": {"lat": lat, "lng": lng}
    }

def plan_trip_smart(data):
    """
    Smart trip planning with time-based scheduling, realistic durations, and cost estimation.
    """
    prefs = {
        "starting_address": data.get("starting_address", "Boston, MA"),
        "interests": data.get("interests", []),
        "budget": data.get("budget", "low"),
        "max_distance": data.get("max_distance", 30),
        "travel_mode": data.get("travel_mode", "driving-car")
    }
    
    start_time = data.get("start_time", "09:00")
    end_time = data.get("end_time", "17:00")
    
    if MOCK:
        places = MOCK_PLACES
        weather = MOCK_WEATHER
        lat, lng = 42.36, -71.06
    else:
        # resolve starting address to coords
        lat, lng = geocode_address(prefs["starting_address"])
        places = fetch_places_from_geoapify(
            lat, lng,
            interests=prefs["interests"],
            max_distance=prefs["max_distance"],
            budget=prefs["budget"]
        )
        
        # Calculate travel times from starting point to each place
        places = calculate_travel_time_from_start(lat, lng, places, prefs["travel_mode"])
        
        # TODO: swap in real weather API as needed
        weather = MOCK_WEATHER
    
    # Call enhanced LLM with time constraints
    smart_itinerary = call_llm_smart(prefs, places, weather, start_time, end_time)
    
    # Also score activities to get relevance scores for the generated itinerary
    activity_scores = score_activities_with_llm(prefs, places)
    
    # Add lat/lng, distance info, and relevance scoring to itinerary items by matching names
    for item in smart_itinerary:
        matching_place = next((p for p in places if p['name'] == item['name']), None)
        if matching_place:
            item['lat'] = matching_place.get('lat')
            item['lng'] = matching_place.get('lng')
            item['distance_km'] = matching_place.get('distance_km', 0)
        else:
            # If no exact match, try to find a similar place or use defaults
            item['lat'] = None
            item['lng'] = None
            item['distance_km'] = 0
        
        # Add relevance score and matched_reason for consistency
        item_name = item.get('name')
        if item_name in activity_scores:
            item['relevance_score'] = activity_scores[item_name].get('relevance_score', 50)
            item['matched_reason'] = activity_scores[item_name].get('matched_reason', item.get('reason', 'A great activity to enjoy.'))
        else:
            item['relevance_score'] = 50
            item['matched_reason'] = item.get('reason', 'A great activity to enjoy.')
    
    # Calculate total cost and time
    total_cost = 0
    total_time_hours = 0
    
    for item in smart_itinerary:
        # Parse cost
        cost_str = item.get('cost', 'Free')
        if cost_str != 'Free' and '$' in cost_str:
            try:
                cost_value = float(cost_str.replace('$', '').replace(',', ''))
                total_cost += cost_value
            except ValueError:
                pass
        
        # Parse duration
        duration_str = item.get('duration', '0 hours')
        try:
            if 'hour' in duration_str:
                hours = float(duration_str.split('hour')[0].strip())
                total_time_hours += hours
            elif 'minute' in duration_str:
                minutes = float(duration_str.split('minute')[0].strip())
                total_time_hours += minutes / 60
        except ValueError:
            pass
        
        # Add travel time
        travel_min = item.get('travel_time_min', 0)
        total_time_hours += travel_min / 60
    
    return {
        "itinerary": smart_itinerary,
        "weather": weather,
        "places": places,
        "starting_coords": {"lat": lat, "lng": lng},
        "total_cost": round(total_cost, 2),
        "total_time_hours": round(total_time_hours, 2)
    }