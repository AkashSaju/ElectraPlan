from flask import Flask, render_template, request, jsonify, redirect, url_for
import os
import sqlite3
import json
import cv2
import numpy as np
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))

TEMPLATE_DIR = os.path.join(PROJECT_ROOT, "templates")
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
DB_PATH = os.path.join(DATA_DIR, "plans.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.config["UPLOAD_FOLDER"] = UPLOAD_DIR


# ---------------- DB Helpers ----------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            canvas_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()


init_db()


# ---------------- ROUTES ----------------
@app.route("/")
def dashboard():
    conn = get_db()
    plans = conn.execute("SELECT * FROM plans ORDER BY updated_at DESC").fetchall()
    conn.close()
    return render_template("dashboard.html", plans=plans)


@app.route("/new-plan", methods=["POST"])
def new_plan():
    name = request.form.get("name", "Untitled Plan")

    empty_state = []  # start with empty canvasObjects
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO plans (name, canvas_json) VALUES (?, ?)",
        (name, json.dumps(empty_state))
    )
    conn.commit()
    plan_id = cur.lastrowid
    conn.close()

    return redirect(url_for("editor", plan_id=plan_id))


@app.route("/editor/<int:plan_id>")
def editor(plan_id):
    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    conn.close()

    if not plan:
        return "Plan not found", 404

    return render_template("canvas.html", plan_id=plan["id"], plan_name=plan["name"])


@app.route("/load-plan/<int:plan_id>")
def load_plan(plan_id):
    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    conn.close()

    if not plan:
        return jsonify({"error": "plan not found"}), 404

    return jsonify({
        "id": plan["id"],
        "name": plan["name"],
        "canvasObjects": json.loads(plan["canvas_json"])
    })


@app.route("/save-plan/<int:plan_id>", methods=["POST"])
def save_plan(plan_id):
    data = request.json

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE plans
        SET canvas_json=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=?
    """, (json.dumps(data), plan_id))
    conn.commit()
    conn.close()

    return jsonify({"status": "saved", "plan_id": plan_id, "objects": len(data)})


# ---------------- Image Upload (for detection) ----------------
@app.route("/upload-plan", methods=["POST"])
def upload_plan():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)

    return jsonify({"status": "uploaded", "filename": filename})

@app.route("/electrical-templates/<int:plan_id>")
def electrical_templates(plan_id):
    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=?", (plan_id,)).fetchone()
    conn.close()

    if not plan:
        return "Plan not found", 404

    return render_template(
        "electrical_templates.html",
        plan_id=plan["id"],
        plan_name=plan["name"]
    )


# ---------------- Detection (basic stable version) ----------------
@app.route("/detect-walls", methods=["POST"])
def detect_walls():
    data = request.json
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "filename missing"}), 400

    img_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    img = cv2.imread(img_path)

    if img is None:
        return jsonify({"error": "unable to read image"}), 400

    # resize
    scale = 1200 / img.shape[1] if img.shape[1] > 1200 else 1.0
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 7, 60, 60)

    edges = cv2.Canny(gray, 40, 140, apertureSize=3)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    processed_edges = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
    processed_edges = cv2.dilate(processed_edges, kernel, iterations=1)

    lines = cv2.HoughLinesP(
        processed_edges,
        rho=1,
        theta=np.pi / 180,
        threshold=90,
        minLineLength=80,
        maxLineGap=25
    )

    walls = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]

            # scale back
            x1 = int(x1 / scale)
            y1 = int(y1 / scale)
            x2 = int(x2 / scale)
            y2 = int(y2 / scale)

            walls.append({"type": "wall", "x1": x1, "y1": y1, "x2": x2, "y2": y2})

    return jsonify({"status": "ok", "walls": walls, "count": len(walls)})


if __name__ == "__main__":
    app.run(debug=True)
DB_PATH = os.path.join(DATA_DIR, "plans.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            canvas_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
