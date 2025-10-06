import os
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from services import plan_trip

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

app = Flask(__name__, static_folder="../static", static_url_path="/static")

@app.route("/")
def index():
    return send_from_directory("../static", "index.html")

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

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
