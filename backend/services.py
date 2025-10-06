3# services.py
import os
import json
import requests
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

MOCK = os.getenv("MOCK", "true").lower() == "true"
GEOAPIFY_KEY = os.getenv("GEOAPIFY_API_KEY")
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

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

# ---------------- existing LLM code ----------------

def call_llm(prefs, places, weather, travel_times):
    prompt = f"""
    User preferences: {prefs}
    Available places: {places}
    Weather: {weather}
    Travel times (in minutes): {travel_times}
    Generate a polished day trip itinerary: Rank and filter places based on interests, budget, weather (prefer indoor if rainy), and travel times. Create a sequential list starting at 9AM, with 1-2 hours per stop, reasons for each, and estimates for time/cost.
    Output as a JSON list of objects, where each object has 'time', 'name', 'reason', 'cost', and 'travel_time_min' fields.
    Example: [
        {{"time": "9:00 AM", "name": "Place Name", "reason": "Why this fits", "cost": "low", "travel_time_min": 10}}
    ]
    Return only the JSON list, no additional text or markdown.
    """
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a trip planner AI. Respond with valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7
    )
    try:
        return json.loads(response.choices[0].message.content)
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
    else:
        # resolve starting address to coords
        lat, lng = geocode_address(prefs["starting_address"])
        places = fetch_places_from_geoapify(
            lat, lng,
            interests=prefs["interests"],
            max_distance=prefs["max_distance"],
            budget=prefs["budget"]
        )
        # TODO: swap in real weather and travel time APIs as needed
        weather = MOCK_WEATHER
        travel_times = {place['id']: 10 for place in places}  # dummy travel times for now
    polished_itinerary = call_llm(prefs, places, weather, travel_times)
    return {
        "itinerary": polished_itinerary,
        "weather": weather,
        "places": places
    }
