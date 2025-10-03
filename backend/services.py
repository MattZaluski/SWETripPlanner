import os
import random

MOCK = os.getenv("MOCK", "true").lower() == "true"
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
PLACES_KEY = os.getenv("PLACES_API_KEY")
WEATHER_KEY = os.getenv("WEATHER_API_KEY")

MOCK_PLACES = [
    {"id":"p1","name":"Museum of Stuff","lat":42.36,"lng":-71.06,"type":"museum","cost":"low","hours":"10-17"},
    {"id":"p2","name":"Sunny Park","lat":42.37,"lng":-71.05,"type":"park","cost":"free","hours":"6-20"},
    {"id":"p3","name":"Joe's Diner","lat":42.355,"lng":-71.07,"type":"restaurant","cost":"low","hours":"7-21"},
]

MOCK_WEATHER = {"summary":"clear","temp_f":65, "precip":0}

def fetch_places(lat, lng, radius, interests):
    if MOCK:
        return MOCK_PLACES
    # TODO: implement server-side call to Google Places / Yelp using PLACES_KEY
    raise NotImplementedError("Add real places API call here")

def fetch_weather(lat, lng, date):
    if MOCK:
        return MOCK_WEATHER
    # TODO: implement real weather API call using WEATHER_KEY
    raise NotImplementedError("Add real weather API call here")

def score_and_rank(places, prefs, weather):
    scored = []
    for p in places:
        score = 0
        if p.get("type") in prefs.get("interests", []):
            score += 5
        if p.get("cost") == prefs.get("budget"):
            score += 2
        if weather.get("precip", 0) > 0 and p.get("type") == "park":
            score -= 3
        score += random.random()
        scored.append({**p, "score": score})
    scored.sort(key=lambda x: -x["score"])
    return scored

def call_llm(itinerary_summary):
    if MOCK:
        for i, stop in enumerate(itinerary_summary):
            stop["reason"] = f"{stop['name']} is a great match for your interests."
        return itinerary_summary
    # TODO: implement OpenAI call with OPENAI_KEY here (server-side)
    raise NotImplementedError("Implement LLM call")

def plan_trip(data):
    loc = data["location"]
    prefs = {"interests": data.get("interests", []), "budget": data.get("budget")}
    places = fetch_places(loc["lat"], loc["lng"], data.get("radius_miles", 30), prefs["interests"])
    weather = fetch_weather(loc["lat"], loc["lng"], data.get("date"))
    ranked = score_and_rank(places, prefs, weather)
    top = ranked[:5]
    polished = call_llm(top)
    result = []
    for i, stop in enumerate(polished):
        result.append({
            "order": i+1,
            "name": stop["name"],
            "lat": stop["lat"],
            "lng": stop["lng"],
            "time": f"{9+i}:00",
            "cost": stop.get("cost","unknown"),
            "reason": stop.get("reason","")
        })
    return result
