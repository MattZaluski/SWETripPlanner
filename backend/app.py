import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from services import plan_trip, calculate_route

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__, static_folder="../static", static_url_path="/static")

@app.route("/")
def index():
    return send_from_directory("../static", "index.html")

@app.route("/explore")
def explore():
    return send_from_directory("../static", "explore.html")

@app.route("/api/plan", methods=["POST"])
def api_plan():
    data = request.get_json()
    if not data or "starting_address" not in data:
        return jsonify({"error": "missing starting_address"}), 400
    try:
        result = plan_trip(data)
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

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)