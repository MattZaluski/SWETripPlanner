import os
import uuid
import threading
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from services import (
    plan_trip, plan_trip_smart, calculate_route,
    geocoding_cache, weather_cache, places_cache, llm_scoring_cache, routing_cache
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__, static_folder="../static", static_url_path="/static")

# In-memory cache for paginated search results
# Structure: {session_id: {'results': [...], 'weather': {...}, 'starting_coords': {...}, 'expires': datetime}}
search_results_cache = {}

@app.route("/")
def index():
    return send_from_directory("../static", "index.html")

@app.route("/explore")
def explore():
    return send_from_directory("../static", "explore.html")

@app.route("/api/plan", methods=["POST"])
def api_plan():
    """
    Plan trip with pagination support.
    Expects:
    - session_id (optional): For fetching subsequent pages from cached results
    - offset (optional): Starting index for pagination (default: 0)
    - limit (optional): Number of results to return (default: 10)
    - starting_address, interests, budget, etc.: Trip planning parameters
    """
    data = request.get_json()
    if not data or "starting_address" not in data:
        return jsonify({"error": "missing starting_address"}), 400
    
    session_id = data.get('session_id')
    offset = data.get('offset', 0)
    limit = data.get('limit', 10)
    
    try:
        # Check if we have cached results for this session
        if session_id and session_id in search_results_cache:
            cached = search_results_cache[session_id]
            
            # Check if cache is still valid
            if cached['expires'] > datetime.now():
                results = cached['results']
                
                # Return paginated results
                paginated_results = results[offset:offset + limit]
                
                return jsonify({
                    'itinerary': paginated_results,
                    'weather': cached['weather'],
                    'starting_coords': cached['starting_coords'],
                    'session_id': session_id,
                    'total_count': len(results),
                    'has_more': offset + limit < len(results),
                    'offset': offset,
                    'limit': limit
                })
            else:
                # Cache expired, remove it
                del search_results_cache[session_id]
        
        # First call or cache miss: Generate full results
        result = plan_trip(data)
        
        # Generate new session ID
        new_session_id = str(uuid.uuid4())
        
        # Cache full results (expires in 10 minutes)
        search_results_cache[new_session_id] = {
            'results': result.get('itinerary', []),
            'weather': result.get('weather', {}),
            'starting_coords': result.get('starting_coords', {}),
            'expires': datetime.now() + timedelta(minutes=10)
        }
        
        # Return first page
        all_results = result.get('itinerary', [])
        paginated_results = all_results[0:limit]
        
        return jsonify({
            'itinerary': paginated_results,
            'weather': result.get('weather', {}),
            'starting_coords': result.get('starting_coords', {}),
            'session_id': new_session_id,
            'total_count': len(all_results),
            'has_more': len(all_results) > limit,
            'offset': 0,
            'limit': limit
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/plan-smart", methods=["POST"])
def api_plan_smart():
    """
    Smart trip planning with time-based scheduling and AI-generated durations.
    Expects JSON body with:
    - starting_address: string
    - interests: array of strings
    - budget: string (low/medium/high)
    - max_distance: number (miles)
    - travel_mode: string (driving-car, cycling-regular, foot-walking)
    - start_time: string (HH:MM format, e.g. "09:00")
    - end_time: string (HH:MM format, e.g. "17:00")
    """
    data = request.get_json()
    if not data or "starting_address" not in data:
        return jsonify({"error": "missing starting_address"}), 400
    
    if "start_time" not in data or "end_time" not in data:
        return jsonify({"error": "missing start_time or end_time"}), 400
    
    try:
        result = plan_trip_smart(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/calculate-route", methods=["POST"])
def api_calculate_route():
    """
    Calculate routing for a sequence of activities in an itinerary.
    Expects JSON body with:
    - waypoints: array of {lat, lng} objects
    - travel_mode: string (driving-car, cycling-regular, foot-walking)
    """
    data = request.get_json()
    if not data or "waypoints" not in data:
        return jsonify({"error": "missing waypoints"}), 400
    
    waypoints = data.get("waypoints", [])
    travel_mode = data.get("travel_mode", "driving-car")
    
    if len(waypoints) < 2:
        return jsonify({"error": "need at least 2 waypoints"}), 400
    
    try:
        # Convert waypoints to tuples
        waypoint_tuples = [(w["lat"], w["lng"]) for w in waypoints]
        route_data = calculate_route(waypoint_tuples, travel_mode)
        return jsonify(route_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cache-stats", methods=["GET"])
def api_cache_stats():
    """
    Get statistics about cache performance.
    Returns information about all active caches.
    """
    try:
        stats = {
            "geocoding": geocoding_cache.get_stats(),
            "weather": weather_cache.get_stats(),
            "places": places_cache.get_stats(),
            "llm_scoring": llm_scoring_cache.get_stats(),
            "routing": routing_cache.get_stats(),
            "total_active": sum([
                geocoding_cache.get_stats()["active_entries"],
                weather_cache.get_stats()["active_entries"],
                places_cache.get_stats()["active_entries"],
                llm_scoring_cache.get_stats()["active_entries"],
                routing_cache.get_stats()["active_entries"]
            ])
        }
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/clear-cache", methods=["POST"])
def api_clear_cache():
    """
    Clear all caches. Useful for testing or manual cache management.
    """
    try:
        geocoding_cache.clear()
        weather_cache.clear()
        places_cache.clear()
        llm_scoring_cache.clear()
        routing_cache.clear()
        return jsonify({"message": "All caches cleared successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def cleanup_expired_cache():
    """Clean up expired entries from search results cache."""
    now = datetime.now()
    expired_keys = [k for k, v in search_results_cache.items() if v['expires'] < now]
    for key in expired_keys:
        del search_results_cache[key]
    
    if expired_keys:
        print(f"Cleaned up {len(expired_keys)} expired cache entries")
    
    # Schedule next cleanup in 15 minutes
    threading.Timer(15 * 60, cleanup_expired_cache).start()

if __name__ == "__main__":
    # Start background cache cleanup
    threading.Timer(15 * 60, cleanup_expired_cache).start()
    
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)