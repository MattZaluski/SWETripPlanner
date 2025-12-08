import os
import uuid
import threading
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, g
from dotenv import load_dotenv
from functools import wraps
from services import (
    plan_trip, plan_trip_smart, calculate_route,
    geocoding_cache, weather_cache, places_cache, llm_scoring_cache, routing_cache,
    register_user, login_user, logout_user, get_user_by_session_token,
    save_itinerary_service, get_trips, MOCK,
    # AI Enhancement Features
    chat_with_assistant, summarize_activity, summarize_activities_batch,
    generate_route_narration, update_user_preferences, get_user_preferences,
    generate_personalized_recommendations, suggest_alternatives, suggest_replan_optimization
)

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__, static_folder="../static", static_url_path="/static")

# Provided a simple rout protection overlay 
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        # In MOCK mode, allow a mock user for testing
        if MOCK:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.lower().startswith("bearer mock") or auth_header.lower().startswith("bearer test"):
                # Create a mock user for testing
                g.current_user = {
                    "_id": "mock-user-id-12345",
                    "First_Name": "Test",
                    "Last_Name": "User",
                    "Email": "test@example.com",
                    "session_expires": datetime.utcnow() + timedelta(hours=24)
                }
                return f(*args, **kwargs)
        
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.lower().startswith("bearer "):
            return jsonify({"error": "Authorization header missing or invalid"}), 401

        session_token = auth_header[7:]
        user = get_user_by_session_token(session_token)
        if not user or 'session_expires' not in user:
            return jsonify({"error": "Login to Use feature"}), 401

        if user['session_expires'] < datetime.utcnow():
            # Session expired, log the user out
            logout_user(session_token)
            return jsonify({"error": "Session Expired Please Logout"}), 401

        g.current_user = user
        return f(*args, **kwargs)
    return decorated

# In-memory cache for paginated search results
# Structure: {session_id: {'results': [...], 'weather': {...}, 'starting_coords': {...}, 'expires': datetime}}
search_results_cache = {}

@app.route("/")
def index():
    return send_from_directory("../static", "index.html")

@app.route("/explore")
def explore():
    return send_from_directory("../static", "explore.html")

@app.route("/saved")
def saved():
    return send_from_directory("../static", "saved.html")

@app.route("/login")
def login_page():
    return send_from_directory("../static", "login.html")

@app.route("/register")
def register_page():
    return send_from_directory("../static", "register.html")

@app.route("/api/config", methods=["GET"])
def api_config():
    """
    Return configuration required for frontend.
    Includes mock_mode flag so frontend can adapt its behavior.
    """
    return jsonify({
        "geoapify_key": os.getenv("GEOAPIFY_API_KEY"),
        "mock_mode": MOCK,
        "has_llm": bool(os.getenv("OPENAI_API_KEY") or os.getenv("GEMINI_API_KEY")),
        "has_mongodb": bool(os.getenv("MONGO_URI")) and not MOCK
    })

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
    Note: Does not require login - routing is a core feature for all users.
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
    
@app.route("/api/register-user", methods=["POST"])
def api_register_user():
    data = request.get_json()
    if not data or not all(k in data for k in ("first_name", "last_name", "email", "password")):
        return jsonify({"error": "missing required fields"}), 400
    
    result = register_user(
        first_name=data["first_name"],
        last_name=data["last_name"],
        email=data["email"],
        password=data["password"]
    )
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)

@app.route("/api/login-user", methods=["POST"])
def api_login_user():
    data = request.get_json()
    if not data or not all(k in data for k in ("email", "password")):
        return jsonify({"error": "missing email or password"}), 400

    result = login_user(data["email"], data["password"])
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)

@app.route("/api/logout-user", methods=["POST"])
def api_logout_user():
    data = request.get_json()
    if not data or "session_token" not in data:
        return jsonify({"error": "missing session_token"}), 400

    result = logout_user(data["session_token"])
    if "error" in result:
        return jsonify(result), 400
    return jsonify(result)

@app.route('/save-itinerary', methods=['POST'])
@login_required
def save_itinerary():
    """
    Save the current itinerary for the logged-in user.
    Expects JSON body:
    - starting_address: string
    - places: array of place objects
    - budget: string
    - interests: array of strings
    - travel_mode: string
    - max_distance: number
    """
    data = request.get_json()
    if not data or "places" not in data or not data["places"]:
        return jsonify({"error": "No activities provided"}), 400

    # Add the logged-in user's ID
    data["user_id"] = str(g.current_user["_id"])

    try:
        result = save_itinerary_service(data)  # calls your service to save to DB
        return jsonify({
            "success": True,
            "trip_id": str(result["trip_id"]),
            "message": "Trip saved successfully!"
        }), 200
    except Exception as e:
        print("Error saving trip:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/api/protected')
@login_required
def protected():
    user = g.current_user  # The full user dict from MongoDB
    return jsonify({
        "message": f"Hello {user.get('First_Name', 'user')}! This is protected data."
    })

@app.route("/api/get-trips", methods=["GET"])
@login_required
def api_get_trips():
    """Return all saved trips for the current user."""
    try:
        user = g.current_user
        user_id = str(user["_id"])
        trips = get_trips(user_id)
        return jsonify({"success": True, "trips": trips}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============== AI ENHANCEMENT API ENDPOINTS ==============

@app.route("/api/ai/chat", methods=["POST"])
def api_ai_chat():
    """
    Conversational AI assistant for trip planning.
    Maintains context across the conversation.
    
    Expects JSON:
    - message: The user's message
    - history: Array of previous messages [{role, content}]
    - context: Optional {location, interests, budget, current_itinerary}
    """
    data = request.get_json()
    if not data or "message" not in data:
        return jsonify({"error": "Missing message"}), 400
    
    try:
        result = chat_with_assistant(
            conversation_history=data.get("history", []),
            user_message=data["message"],
            context=data.get("context")
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/summarize", methods=["POST"])
def api_ai_summarize():
    """
    Generate engaging summaries for activities.
    
    Expects JSON:
    - activity: Single activity object, OR
    - activities: Array of activity objects (for batch)
    - interests: Optional array of user interests for personalization
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing data"}), 400
    
    try:
        interests = data.get("interests", [])
        
        if "activities" in data:
            # Batch mode
            summaries = summarize_activities_batch(data["activities"], interests)
            return jsonify({"summaries": summaries})
        elif "activity" in data:
            # Single activity
            summary = summarize_activity(data["activity"], interests)
            return jsonify(summary)
        else:
            return jsonify({"error": "Provide 'activity' or 'activities'"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/narration", methods=["POST"])
def api_ai_narration():
    """
    Generate route narration script for animated playback.
    
    Expects JSON:
    - itinerary: Array of activity objects in order
    - starting_location: Starting address string
    - travel_mode: "driving-car", "foot-walking", or "cycling-regular"
    """
    data = request.get_json()
    if not data or "itinerary" not in data:
        return jsonify({"error": "Missing itinerary"}), 400
    
    try:
        result = generate_route_narration(
            itinerary=data["itinerary"],
            starting_location=data.get("starting_location", "your starting point"),
            travel_mode=data.get("travel_mode", "driving-car")
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/preferences", methods=["GET", "POST"])
def api_ai_preferences():
    """
    GET: Retrieve user's learned preferences
    POST: Update preferences based on user action
    
    POST expects JSON:
    - action: "add", "remove", "complete", "skip"
    - activity: The activity object
    """
    # Get user ID from auth header or use mock
    user_id = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        if MOCK and (token.lower() == "mock" or token.lower() == "test"):
            user_id = "mock-user-id-12345"
        else:
            user = get_user_by_session_token(token)
            if user:
                user_id = str(user["_id"])
    
    if not user_id:
        # Allow anonymous preference tracking with session
        user_id = request.headers.get("X-Session-ID", "anonymous")
    
    if request.method == "GET":
        try:
            prefs = get_user_preferences(user_id)
            return jsonify(prefs)
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    
    else:  # POST
        data = request.get_json()
        if not data or "action" not in data or "activity" not in data:
            return jsonify({"error": "Missing action or activity"}), 400
        
        try:
            profile = update_user_preferences(
                user_id=user_id,
                action=data["action"],
                activity=data["activity"]
            )
            return jsonify({"success": True, "profile_updated": profile is not None})
        except Exception as e:
            return jsonify({"error": str(e)}), 500


@app.route("/api/ai/recommendations", methods=["POST"])
def api_ai_recommendations():
    """
    Get personalized activity recommendations based on learned preferences.
    
    Expects JSON:
    - current_itinerary: Array of activities already in itinerary
    - available_activities: Array of all available activities to choose from
    """
    data = request.get_json()
    if not data or "available_activities" not in data:
        return jsonify({"error": "Missing available_activities"}), 400
    
    # Get user ID
    user_id = None
    auth_header = request.headers.get('Authorization', '')
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        if MOCK and (token.lower() == "mock" or token.lower() == "test"):
            user_id = "mock-user-id-12345"
        else:
            user = get_user_by_session_token(token)
            if user:
                user_id = str(user["_id"])
    
    if not user_id:
        user_id = request.headers.get("X-Session-ID", "anonymous")
    
    try:
        result = generate_personalized_recommendations(
            user_id=user_id,
            current_itinerary=data.get("current_itinerary", []),
            available_activities=data["available_activities"]
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/alternatives", methods=["POST"])
def api_ai_alternatives():
    """
    Get alternative activities similar to a given one.
    
    Expects JSON:
    - activity: The activity to find alternatives for
    - all_activities: Array of all available activities
    - count: Optional number of alternatives (default 3)
    """
    data = request.get_json()
    if not data or "activity" not in data or "all_activities" not in data:
        return jsonify({"error": "Missing activity or all_activities"}), 400
    
    try:
        result = suggest_alternatives(
            activity=data["activity"],
            all_activities=data["all_activities"],
            count=data.get("count", 3)
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ai/optimize", methods=["POST"])
def api_ai_optimize():
    """
    Get optimization suggestions for the current itinerary.
    
    Expects JSON:
    - itinerary: Array of activities in current order
    - starting_coords: {lat, lng} of starting point
    - travel_mode: Travel mode string
    - context: Optional {weather, current_time}
    """
    data = request.get_json()
    if not data or "itinerary" not in data:
        return jsonify({"error": "Missing itinerary"}), 400
    
    try:
        result = suggest_replan_optimization(
            itinerary=data["itinerary"],
            starting_coords=data.get("starting_coords"),
            travel_mode=data.get("travel_mode", "driving-car"),
            context=data.get("context")
        )
        return jsonify(result)
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
    
    # Default to port 5050 to avoid macOS AirPlay conflict on port 5000
    port = int(os.getenv("PORT", 5050))
    print(f"🚀 Starting server on http://127.0.0.1:{port}")
    print(f"   Open http://127.0.0.1:{port}/explore to use the app")
    app.run(host="0.0.0.0", port=port, debug=True)