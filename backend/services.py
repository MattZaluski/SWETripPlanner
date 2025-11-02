import os
import json
import requests
import time
import hashlib
from datetime import datetime, timedelta
import secrets
from bson import ObjectId
from pymongo import MongoClient
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai

load_dotenv()

# ============== Simple Cache Implementation ==============

class SimpleCache:
    """
    Simple time-based cache with automatic expiration.
    Each cache entry has a TTL (time to live) in seconds.
    """
    def __init__(self):
        self._cache = {}
    
    def _generate_key(self, *args, **kwargs):
        """Generate a cache key from arguments."""
        key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True)
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def get(self, key):
        """Get value from cache if not expired."""
        if key in self._cache:
            value, expiry_time = self._cache[key]
            if time.time() < expiry_time:
                return value
            else:
                # Remove expired entry
                del self._cache[key]
        return None
    
    def set(self, key, value, ttl_seconds):
        """Set value in cache with TTL (time to live) in seconds."""
        expiry_time = time.time() + ttl_seconds
        self._cache[key] = (value, expiry_time)
    
    def clear(self):
        """Clear all cache entries."""
        self._cache.clear()
    
    def get_stats(self):
        """Get cache statistics."""
        total = len(self._cache)
        expired = sum(1 for _, (_, exp) in self._cache.items() if time.time() >= exp)
        return {
            "total_entries": total,
            "active_entries": total - expired,
            "expired_entries": expired
        }

# Initialize caches with different TTLs for different data types
geocoding_cache = SimpleCache()      # 24 hours - addresses don't change
weather_cache = SimpleCache()        # 30 minutes - weather updates frequently
places_cache = SimpleCache()         # 2 hours - places don't change often
llm_scoring_cache = SimpleCache()    # 1 hour - scores can be reused
routing_cache = SimpleCache()        # 6 hours - routes are fairly static

# Cache TTL constants (in seconds)
GEOCODING_TTL = 24 * 60 * 60  # 24 hours
WEATHER_TTL = 30 * 60          # 30 minutes
PLACES_TTL = 2 * 60 * 60       # 2 hours
LLM_SCORING_TTL = 60 * 60      # 1 hour
ROUTING_TTL = 6 * 60 * 60      # 6 hours

load_dotenv()

MOCK = os.getenv("MOCK", "true").lower() == "true"
GEOAPIFY_KEY = os.getenv("GEOAPIFY_API_KEY")
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

# MongoDB Configuration
MONGO_URI = os.getenv("MONGO_URI")
mongo = MongoClient(MONGO_URI)
db = mongo["Geo_Guide"]
users_col = db["users"]

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', 'AIzaSyDW7M2_HtcbiA3FaOy1waVpqrmCl9CUXWY')
genai.configure(api_key=GEMINI_API_KEY)

# --- Keep your old mocks for quick fallback/testing ---
MOCK_PLACES = [
    {"id": "p1", "name": "Museum of Stuff", "lat": 42.36, "lng": -71.06, "type": "museum", "cost": "low", "hours": "10-17", "address": "123 Main St, Boston, MA 02101", "street": "123 Main St", "city": "Boston", "state": "MA", "country": "USA"},
    {"id": "p2", "name": "Sunny Park", "lat": 42.37, "lng": -71.05, "type": "park", "cost": "free", "hours": "6-20", "address": "456 Park Ave, Boston, MA 02102", "street": "456 Park Ave", "city": "Boston", "state": "MA", "country": "USA"},
    {"id": "p3", "name": "Joe's Diner", "lat": 42.355, "lng": -71.07, "type": "restaurant", "cost": "low", "hours": "7-21", "address": "789 Food St, Boston, MA 02103", "street": "789 Food St", "city": "Boston", "state": "MA", "country": "USA"},
]

MOCK_WEATHER = {"summary": "clear", "temp_f": 65, "precip": 0}
MOCK_TRAVEL_TIMES = {"p1": 10, "p2": 15, "p3": 20}

# ---------------- Weather helpers ----------------

def fetch_weather_from_openmeteo(lat, lng):
    """
    Fetch current and hourly weather data from Open-Meteo API.
    Results are cached for 30 minutes (weather changes frequently).
    """
    # Check cache first - round coordinates to 2 decimals for cache key
    cache_key = f"weather_{round(lat, 2)}_{round(lng, 2)}"
    cached_result = weather_cache.get(cache_key)
    if cached_result:
        print(f"✓ Cache hit: Weather for ({lat}, {lng})")
        return cached_result
    
    print(f"⚡ Cache miss: Fetching weather for ({lat}, {lng})")
    
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lng,
            "hourly": "temperature_2m,precipitation_probability,precipitation",
            "temperature_unit": "fahrenheit",
            "timezone": "auto"
        }
        
        r = requests.get(url, params=params, timeout=10)
        if not r.ok:
            raise Exception(f"Open-Meteo API error: {r.status_code} {r.text}")
        
        data = r.json()
        hourly = data.get("hourly", {})
        
        # Get current hour data (first entry in the hourly arrays)
        if hourly and len(hourly.get("time", [])) > 0:
            current_temp = hourly["temperature_2m"][0] if hourly.get("temperature_2m") else 65
            current_precip_prob = hourly["precipitation_probability"][0] if hourly.get("precipitation_probability") else 0
            current_precip = hourly["precipitation"][0] if hourly.get("precipitation") else 0
            
            # Calculate average conditions for the day (next 12 hours)
            hours_to_check = min(12, len(hourly.get("time", [])))
            avg_temp = sum(hourly["temperature_2m"][:hours_to_check]) / hours_to_check if hourly.get("temperature_2m") else current_temp
            avg_precip_prob = sum(hourly["precipitation_probability"][:hours_to_check]) / hours_to_check if hourly.get("precipitation_probability") else current_precip_prob
            max_precip_prob = max(hourly["precipitation_probability"][:hours_to_check]) if hourly.get("precipitation_probability") else current_precip_prob
            
            # Determine weather summary based on conditions
            if max_precip_prob > 60:
                summary = "rainy"
            elif max_precip_prob > 30:
                summary = "partly cloudy"
            else:
                summary = "clear"
            
            result = {
                "summary": summary,
                "temp_f": round(current_temp, 1),
                "avg_temp_f": round(avg_temp, 1),
                "precip_probability": round(current_precip_prob),
                "avg_precip_probability": round(avg_precip_prob),
                "max_precip_probability": round(max_precip_prob),
                "precip_mm": round(current_precip, 2),
                "has_poor_weather": max_precip_prob > 60  # Threshold for outdoor activity warnings
            }
        else:
            # Fallback if no data
            result = {
                "summary": "clear",
                "temp_f": 65,
                "avg_temp_f": 65,
                "precip_probability": 0,
                "avg_precip_probability": 0,
                "max_precip_probability": 0,
                "precip_mm": 0,
                "has_poor_weather": False
            }
        
        # Cache the result
        weather_cache.set(cache_key, result, WEATHER_TTL)
        return result
    
    except Exception as e:
        print(f"Error fetching weather from Open-Meteo: {e}")
        # Return fallback weather data (don't cache errors)
        return {
            "summary": "clear",
            "temp_f": 65,
            "avg_temp_f": 65,
            "precip_probability": 0,
            "avg_precip_probability": 0,
            "max_precip_probability": 0,
            "precip_mm": 0,
            "has_poor_weather": False
        }

# ---------------- Geoapify helpers ----------------

def geocode_address(address):
    """
    Uses Geoapify Forward Geocoding to resolve an address to (lat, lon).
    Results are cached for 24 hours.
    """
    # Check cache first
    cache_key = f"geocode_{address.lower().strip()}"
    cached_result = geocoding_cache.get(cache_key)
    if cached_result:
        print(f"✓ Cache hit: Geocoding for '{address}'")
        return cached_result
    
    print(f"⚡ Cache miss: Geocoding '{address}'")
    
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
    
    result = (float(lat), float(lon))
    
    # Cache the result
    geocoding_cache.set(cache_key, result, GEOCODING_TTL)
    
    return result

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
    Results are cached for 2 hours (places don't change often).
    """
    # Create cache key based on location, interests, and distance
    interests_sorted = sorted(interests or [])
    cache_key = f"places_{round(lat, 2)}_{round(lng, 2)}_{'-'.join(interests_sorted)}_{max_distance}_{budget}"
    cached_result = places_cache.get(cache_key)
    if cached_result:
        print(f"✓ Cache hit: Places for ({lat}, {lng})")
        return cached_result
    
    print(f"⚡ Cache miss: Fetching places for ({lat}, {lng})")
    
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

        # Extract address information
        address_line1 = p.get("address_line1") or ""
        address_line2 = p.get("address_line2") or ""
        street = p.get("street") or ""
        housenumber = p.get("housenumber") or ""
        city = p.get("city") or ""
        state = p.get("state") or ""
        postcode = p.get("postcode") or ""
        country = p.get("country") or ""
        
        # Build formatted address
        street_address = f"{housenumber} {street}".strip() if housenumber or street else address_line1
        city_state = f"{city}, {state}".strip(", ") if city or state else ""
        
        # Full formatted address
        formatted_address = p.get("formatted") or ""
        if not formatted_address:
            address_parts = [part for part in [street_address, city_state, postcode] if part]
            formatted_address = ", ".join(address_parts)
        
        place_obj = {
            "id": p.get("place_id") or p.get("osm_id") or p.get("xid") or p.get("id") or str(p.get("lat")) + "_" + str(p.get("lon")),
            "name": p.get("name") or p.get("formatted") or "Unknown",
            "lat": float(lat_p) if lat_p is not None else None,
            "lng": float(lon_p) if lon_p is not None else None,
            "type": type_str,
            "cost": cost,
            "hours": hours,
            "address": formatted_address,
            "street": street_address,
            "city": city,
            "state": state,
            "country": country
        }
        places.append(place_obj)

    # Cache the result
    places_cache.set(cache_key, places, PLACES_TTL)
    
    return places

def calculate_route(waypoints, travel_mode):
    """
    Calculate routing data between multiple waypoints using Geoapify Routing API.
    Results are cached for 6 hours (routes are relatively static).
    
    Args:
        waypoints: List of (lat, lng) tuples representing waypoints in order
        travel_mode: One of 'drive', 'bicycle', 'walk' (Geoapify format)
        
    Returns:
        Dictionary with route information including:
        - total_distance_km: Total distance in kilometers
        - total_time_min: Total time in minutes
        - legs: List of leg data (distance and time for each segment)
    """
    # Create cache key from waypoints and travel mode (round to 3 decimals)
    waypoints_key = "_".join([f"{round(lat, 3)},{round(lng, 3)}" for lat, lng in waypoints])
    cache_key = f"route_{waypoints_key}_{travel_mode}"
    cached_result = routing_cache.get(cache_key)
    if cached_result:
        print(f"✓ Cache hit: Route calculation")
        return cached_result
    
    print(f"⚡ Cache miss: Calculating route")
    
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
        
        result = {
            "total_distance_km": round(total_distance_km, 2),
            "total_time_min": round(total_time_min, 1),
            "legs": legs
        }
        
        # Cache the result
        routing_cache.set(cache_key, result, ROUTING_TTL)
        
        return result
    
    except Exception as e:
        print(f"Routing error: {e}")
        # Return fallback data (don't cache errors)
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
        content = response.choices[0].message.content
        if not content or content.strip() == "":
            print("LLM returned empty content, using fallback")
            return []
        
        # Remove markdown code blocks if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Failed to parse LLM response as JSON: {str(e)}")
        print(f"LLM response content: {response.choices[0].message.content[:500]}")
        return []  # Return empty list as fallback
    except Exception as e:
        print(f"Unexpected error parsing LLM response: {str(e)}")
        return []

def score_activities_with_llm(prefs, places, weather=None):
    """
    Use LLM to score each activity's relevance to user preferences and provide reasoning.
    Now includes weather-aware scoring and outdoor activity detection.
    Results are cached for 1 hour.
    Returns a dict mapping place names to {relevance_score, matched_reason, is_outdoor, weather_warning}.
    """
    # Create cache key from preferences, place names, and weather conditions
    place_names = sorted([p.get('name', '') for p in places[:20]])
    interests_sorted = sorted(prefs.get('interests', []))
    weather_key = f"{weather.get('summary', 'clear')}_{weather.get('max_precip_probability', 0)}" if weather else "no_weather"
    cache_key = hashlib.md5(
        f"llm_score_{'-'.join(place_names)}_{'-'.join(interests_sorted)}_{prefs.get('budget', 'medium')}_{weather_key}".encode()
    ).hexdigest()
    
    cached_result = llm_scoring_cache.get(cache_key)
    if cached_result:
        print(f"✓ Cache hit: LLM activity scoring")
        return cached_result
    
    print(f"⚡ Cache miss: Running LLM activity scoring")
    
    weather_context = ""
    if weather:
        weather_context = f"""
    Current Weather Conditions:
    - Summary: {weather.get('summary', 'clear')}
    - Temperature: {weather.get('temp_f', 65)}°F (Avg: {weather.get('avg_temp_f', 65)}°F)
    - Precipitation Probability: {weather.get('max_precip_probability', 0)}% (max in next 12 hours)
    - Poor Weather Alert: {'Yes - High chance of rain' if weather.get('has_poor_weather') else 'No'}
    """
    
    prompt = f"""
    You are an expert trip advisor analyzing activities for a traveler.
    
    User Preferences:
    - Interests: {prefs.get('interests', [])}
    - Budget: {prefs.get('budget', 'medium')}
    - Travel Mode: {prefs.get('travel_mode', 'driving-car')}
    {weather_context}
    
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
    3. Whether the activity is primarily outdoors (true/false)
    4. A weather warning message if outdoor activity and poor weather conditions exist (or null if not applicable)
    
    SCORING CRITERIA:
    - Interest alignment: Does it match their stated interests? (40 points)
    - Budget compatibility: Does the cost fit their budget level? (20 points)
    - Accessibility: Is the travel distance/time reasonable? (15 points)
    - Uniqueness/Quality: Is it a notable or special experience? (15 points)
    - Weather suitability: For outdoor activities in poor weather, reduce score by 10-20 points (10 points)
    
    WEATHER CONSIDERATIONS:
    - If precipitation probability > 60% and activity is outdoors, reduce relevance score by 10-20 points
    - Provide a helpful weather warning (e.g., "⚠️ High chance of rain - consider bringing an umbrella or rescheduling")
    - Indoor activities should NOT be penalized and may even be prioritized in poor weather
    
    OUTPUT FORMAT:
    Return ONLY a JSON object mapping activity names to their scores, reasons, outdoor status, and warnings:
    {{
        "Activity Name 1": {{
            "relevance_score": 85,
            "matched_reason": "This museum perfectly aligns with your interest in art and culture, offering world-class exhibits at an affordable price point.",
            "is_outdoor": false,
            "weather_warning": null
        }},
        "Park Name": {{
            "relevance_score": 62,
            "matched_reason": "A beautiful outdoor space ideal for relaxation with free admission.",
            "is_outdoor": true,
            "weather_warning": "⚠️ High chance of rain today - bring rain gear or consider visiting when weather improves"
        }}
    }}
    
    IMPORTANT:
    - Score ALL activities provided
    - Be specific in reasons, referencing their actual interests
    - Keep reasons concise and enthusiastic
    - REDUCE scores for outdoor activities when weather is poor (>60% precipitation)
    - Provide clear, actionable weather warnings for outdoor activities in poor conditions
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
        
        result = json.loads(content)
        
        # Cache the result
        llm_scoring_cache.set(cache_key, result, LLM_SCORING_TTL)
        
        return result
    except Exception as e:
        print(f"Error scoring activities with LLM: {e}")
        # Return default scores if LLM fails (don't cache errors)
        return {place['name']: {
            "relevance_score": 50, 
            "matched_reason": "This activity offers a great local experience.",
            "is_outdoor": False,
            "weather_warning": None
        } for place in places[:20]}

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
        content = response.choices[0].message.content
        if not content or content.strip() == "":
            print("LLM smart returned empty content, using fallback")
            return []
        
        content = content.strip()
        # Remove markdown code blocks if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        
        return json.loads(content)
    except json.JSONDecodeError as e:
        print(f"Failed to parse LLM smart response as JSON: {str(e)}")
        print(f"LLM response content: {response.choices[0].message.content[:500]}")
        return []  # Return empty list as fallback
    except Exception as e:
        print(f"Unexpected error parsing LLM smart response: {str(e)}")
        return []

def plan_trip(data):
    prefs = {
        "starting_address": data.get("starting_address", "Boston, MA"),
        "interests": data.get("interests", []),
        "budget": data.get("budget", "low"),
        "max_distance": data.get("max_distance", 30),
        "travel_mode": data.get("travel_mode", "driving-car"),
        "use_weather": data.get("use_weather", True)  # Default to True for backward compatibility
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
        
        # Fetch real weather data from Open-Meteo
        weather = fetch_weather_from_openmeteo(lat, lng)
        travel_times = {place['id']: place.get('travel_time_min', 10) for place in places}
    
    # Score activities with LLM - pass weather only if use_weather is enabled
    weather_for_scoring = weather if prefs["use_weather"] else None
    activity_scores = score_activities_with_llm(prefs, places, weather_for_scoring)
    
    # Add relevance scores, matched reasons, and weather info to each place
    for place in places:
        place_name = place.get('name')
        if place_name in activity_scores:
            place['relevance_score'] = activity_scores[place_name].get('relevance_score', 50)
            place['matched_reason'] = activity_scores[place_name].get('matched_reason', 'A great local experience.')
            place['is_outdoor'] = activity_scores[place_name].get('is_outdoor', False)
            place['weather_warning'] = activity_scores[place_name].get('weather_warning', None)
        else:
            place['relevance_score'] = 50
            place['matched_reason'] = 'An interesting activity to explore.'
            place['is_outdoor'] = False
            place['weather_warning'] = None
    
    # Sort places by relevance score (highest first)
    places_sorted = sorted(places, key=lambda x: x.get('relevance_score', 0), reverse=True)
    
    polished_itinerary = call_llm(prefs, places_sorted, weather, travel_times)
    
    # Add lat/lng, distance, address info, and weather warnings to itinerary items by matching names
    for item in polished_itinerary:
        matching_place = next((p for p in places_sorted if p['name'] == item['name']), None)
        if matching_place:
            item['lat'] = matching_place.get('lat')
            item['lng'] = matching_place.get('lng')
            item['distance_km'] = matching_place.get('distance_km', 0)
            item['address'] = matching_place.get('address', 'Address not available')
            item['street'] = matching_place.get('street', '')
            item['city'] = matching_place.get('city', '')
            item['state'] = matching_place.get('state', '')
            item['country'] = matching_place.get('country', '')
            item['is_outdoor'] = matching_place.get('is_outdoor', False)
            item['weather_warning'] = matching_place.get('weather_warning', None)
    
    return {
        "itinerary": polished_itinerary,
        "weather": weather,
        "places": places_sorted,
        "starting_coords": {"lat": lat, "lng": lng}
    }

def plan_trip_smart(data):
    """
    Smart trip planning with time-based scheduling, realistic durations, and cost estimation.
    Now also returns all_activities for browsing on the main explore page.
    """
    prefs = {
        "starting_address": data.get("starting_address", "Boston, MA"),
        "interests": data.get("interests", []),
        "budget": data.get("budget", "low"),
        "max_distance": data.get("max_distance", 30),
        "travel_mode": data.get("travel_mode", "driving-car"),
        "use_weather": data.get("use_weather", True)  # Default to True for backward compatibility
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
        
        # Fetch real weather data from Open-Meteo
        weather = fetch_weather_from_openmeteo(lat, lng)
    
    # Call enhanced LLM with time constraints
    smart_itinerary = call_llm_smart(prefs, places, weather, start_time, end_time)
    
    # Score activities - pass weather only if use_weather is enabled
    weather_for_scoring = weather if prefs["use_weather"] else None
    activity_scores = score_activities_with_llm(prefs, places, weather_for_scoring)
    
    # Prepare all activities with scores for browsing (sorted by relevance)
    all_activities = []
    for place in places:
        place_name = place.get('name')
        if place_name in activity_scores:
            place['relevance_score'] = activity_scores[place_name].get('relevance_score', 50)
            place['matched_reason'] = activity_scores[place_name].get('matched_reason', 'A great local experience.')
            place['is_outdoor'] = activity_scores[place_name].get('is_outdoor', False)
            place['weather_warning'] = activity_scores[place_name].get('weather_warning', None)
        else:
            place['relevance_score'] = 50
            place['matched_reason'] = 'An interesting activity to explore.'
            place['is_outdoor'] = False
            place['weather_warning'] = None
        all_activities.append(place)
    
    # Sort by relevance score
    all_activities_sorted = sorted(all_activities, key=lambda x: x.get('relevance_score', 0), reverse=True)
    
    # Add lat/lng, distance info, address, relevance scoring, and weather info to itinerary items by matching names
    for item in smart_itinerary:
        matching_place = next((p for p in places if p['name'] == item['name']), None)
        if matching_place:
            item['lat'] = matching_place.get('lat')
            item['lng'] = matching_place.get('lng')
            item['distance_km'] = matching_place.get('distance_km', 0)
            item['address'] = matching_place.get('address', 'Address not available')
            item['street'] = matching_place.get('street', '')
            item['city'] = matching_place.get('city', '')
            item['state'] = matching_place.get('state', '')
            item['country'] = matching_place.get('country', '')
        else:
            # If no exact match, try to find a similar place or use defaults
            item['lat'] = None
            item['lng'] = None
            item['distance_km'] = 0
            item['address'] = 'Address not available'
            item['street'] = ''
            item['city'] = ''
            item['state'] = ''
            item['country'] = ''
        
        # Add relevance score, matched_reason, and weather info for consistency
        item_name = item.get('name')
        if item_name in activity_scores:
            item['relevance_score'] = activity_scores[item_name].get('relevance_score', 50)
            item['matched_reason'] = activity_scores[item_name].get('matched_reason', item.get('reason', 'A great activity to enjoy.'))
            item['is_outdoor'] = activity_scores[item_name].get('is_outdoor', False)
            item['weather_warning'] = activity_scores[item_name].get('weather_warning', None)
        else:
            item['relevance_score'] = 50
            item['matched_reason'] = item.get('reason', 'A great activity to enjoy.')
            item['is_outdoor'] = False
            item['weather_warning'] = None
    
    # Calculate total cost, activity time, and travel time separately
    total_cost = 0
    total_activity_hours = 0
    total_travel_minutes = 0
    
    for item in smart_itinerary:
        # Parse cost
        cost_str = item.get('cost', 'Free')
        if cost_str != 'Free' and '$' in cost_str:
            try:
                cost_value = float(cost_str.replace('$', '').replace(',', ''))
                total_cost += cost_value
            except ValueError:
                pass
        
        # Parse activity duration
        duration_str = item.get('duration', '0 hours')
        try:
            if 'hour' in duration_str:
                hours = float(duration_str.split('hour')[0].strip())
                total_activity_hours += hours
            elif 'minute' in duration_str:
                minutes = float(duration_str.split('minute')[0].strip())
                total_activity_hours += minutes / 60
        except ValueError:
            pass
        
        # Add travel time separately
        travel_min = item.get('travel_time_min', 0)
        total_travel_minutes += travel_min
    
    # Calculate total time (activity + travel)
    total_time_hours = total_activity_hours + (total_travel_minutes / 60)
    
    return {
        "itinerary": smart_itinerary,
        "all_activities": all_activities_sorted,  # NEW: Full list for browsing
        "weather": weather,
        "places": places,
        "starting_coords": {"lat": lat, "lng": lng},
        "total_cost": round(total_cost, 2),
        "total_time_hours": round(total_time_hours, 2),
        "total_activity_hours": round(total_activity_hours, 2),
        "total_travel_hours": round(total_travel_minutes / 60, 2)
    }

#=====================================================
#                  USER AUTHENTICATION
# =====================================================

def register_user(first_name, last_name, email, password):
    if users_col.find_one({"email": email}):
        return {"error": "Email already exists"}

    hashed_pw = hashlib.sha256(password.encode()).hexdigest()
    verification_token = secrets.token_hex(16)

    users_col.insert_one({
        "First_Name": first_name,
        "Last_Name": last_name,
        "email": email,
        "password_hash": hashed_pw,
        "verified": False,
        "verification_token": verification_token,
        "session_token": None,
        "csrf_token": None,
        "session_expires": None,
        "created_at": datetime.utcnow()
    })

    return {"success": True, "verification_token": verification_token}


def login_user(email, password):
    user = users_col.find_one({"email": email})
    if not user:
        return {"error": "User not found"}

    if hashlib.sha256(password.encode()).hexdigest() != user["password_hash"]:
        return {"error": "Invalid password"}

    session_token = secrets.token_hex(16)
    csrf_token = secrets.token_hex(8)
    expires_at = datetime.utcnow() + timedelta(minutes=30)  # Expire in 30 minutes

    users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"session_token": session_token, "csrf_token": csrf_token, "session_expires": expires_at}}
    )

    return {"success": True, "session_token": session_token, "csrf_token": csrf_token, "user_id": str(user["_id"])}


def logout_user(session_token):
    user = users_col.find_one({"session_token": session_token})
    if not user:
        return {"error": "Invalid session"}

    users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"session_token": None, "csrf_token": None, "session_expires": None}}
    )

    return {"success": True}

def get_user_by_session_token(session_token):
    user = users_col.find_one({"session_token": session_token})
    return user