from flask import Flask, render_template, request, jsonify
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))

TEMPLATE_DIR = os.path.join(PROJECT_ROOT, "templates")
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")

print("✅ TEMPLATE_DIR:", TEMPLATE_DIR, os.path.exists(TEMPLATE_DIR))
print("✅ STATIC_DIR  :", STATIC_DIR, os.path.exists(STATIC_DIR))

app = Flask(
    __name__,
    template_folder=TEMPLATE_DIR,
    static_folder=STATIC_DIR
)

@app.route("/")
def home():
    return render_template("canvas.html")

@app.route("/save-plan", methods=["POST"])
def save_plan():
    data = request.json
    return jsonify({"status": "saved", "objects": len(data)})

if __name__ == "__main__":
    app.run(debug=True)
