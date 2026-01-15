from flask import Flask, request, jsonify

app = Flask(__name__)

WIRING_RULES = {
    "Bedroom": ["Fan", "Light", "Light", "Socket", "Socket"],
    "Kitchen": ["Light", "Socket", "Socket", "Socket"],
    "Hall": ["Fan", "Light", "Light", "Light", "Socket"]
}

@app.route("/generate", methods=["POST"])
def generate_wiring():
    data = request.json
    return jsonify({
        "room": data.get("room_name"),
        "type": data.get("room_type"),
        "dimensions": {
            "length": data.get("length"),
            "width": data.get("width")
        },
        "points": WIRING_RULES.get(data.get("room_type"), [])
    })

if __name__ == "__main__":
    print("Starting ElectraPlan Flask server...")
    app.run(debug=True)
