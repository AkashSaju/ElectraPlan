from flask import Flask, render_template, request, jsonify, redirect, url_for, session
import os
import sqlite3
import json
import cv2
import numpy as np
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

# --- Project Paths ---
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
app.secret_key = "akash_electra_secret_2026" 

# ---------------- DATABASE HELPERS ----------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            canvas_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ---------------- AUTHENTICATION ROUTES ----------------

@app.route("/")
def index():
    if "user_id" in session:
        return redirect(url_for("dashboard"))
    return render_template("index.html")

@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username").lower().strip()
        password = request.form.get("password")
        hashed_pw = generate_password_hash(password)

        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, hashed_pw))
            conn.commit()
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            return "Username already exists!", 400
        finally:
            conn.close()
    return render_template("register.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username").lower()
        password = request.form.get("password")
        
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        conn.close()

        if user and check_password_hash(user["password"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            return redirect(url_for("dashboard"))
        
        return "Invalid credentials", 401
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))

# ---------------- PLAN ROUTES ----------------

@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect(url_for("login"))
    
    conn = get_db()
    plans = conn.execute(
        "SELECT * FROM plans WHERE user_id=? ORDER BY updated_at DESC", 
        (session["user_id"],)
    ).fetchall()
    conn.close()
    return render_template("dashboard.html", plans=plans, username=session["username"])

@app.route("/new-plan", methods=["POST"])
def new_plan():
    if "user_id" not in session:
        return redirect(url_for("login"))

    name = request.form.get("name", "Untitled Plan")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO plans (name, canvas_json, user_id) VALUES (?, ?, ?)",
        (name, json.dumps([]), session["user_id"])
    )
    conn.commit()
    plan_id = cur.lastrowid
    conn.close()
    return redirect(url_for("editor", plan_id=plan_id))

@app.route("/editor/<int:plan_id>")
def editor(plan_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=? AND user_id=?", 
                        (plan_id, session["user_id"])).fetchone()
    conn.close()

    if not plan:
        return "Plan not found or Access Denied", 404

    return render_template("canvas.html", plan_id=plan["id"], plan_name=plan["name"])

@app.route("/load-plan/<int:plan_id>")
def load_plan(plan_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    conn = get_db()
    plan = conn.execute("SELECT * FROM plans WHERE id=? AND user_id=?", 
                        (plan_id, session["user_id"])).fetchone()
    conn.close()

    if not plan:
        return jsonify({"error": "Plan not found"}), 404

    return jsonify({
        "id": plan["id"],
        "name": plan["name"],
        "canvasObjects": json.loads(plan["canvas_json"])
    })

@app.route("/save-plan/<int:plan_id>", methods=["POST"])
def save_plan(plan_id):
    if "user_id" not in session:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.json
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        UPDATE plans
        SET canvas_json=?, updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND user_id=?
    """, (json.dumps(data), plan_id, session["user_id"]))
    conn.commit()
    conn.close()
    return jsonify({"status": "saved"})

@app.route('/delete-plan/<int:plan_id>', methods=['POST'])
def delete_plan(plan_id):
    if "user_id" not in session:
        return redirect(url_for("login"))

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM plans WHERE id=? AND user_id=?", (plan_id, session["user_id"]))
    conn.commit()
    conn.close()
    return redirect(url_for('dashboard'))

# ---------------- WIRING & TEMPLATES ----------------

@app.route("/electrical-templates/<int:plan_id>")
def electrical_templates(plan_id):
    if "user_id" not in session: return redirect(url_for("login"))
    return render_template("electrical_templates.html", plan_id=plan_id)

@app.route('/wiring/<int:plan_id>')
def wiring_view(plan_id):
    if "user_id" not in session: return redirect(url_for("login"))
    return render_template('wiring.html', plan_id=plan_id)

# ---------------- CV ROUTES ----------------

@app.route("/upload-plan", methods=["POST"])
def upload_plan():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    filename = secure_filename(file.filename)
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(save_path)
    return jsonify({"status": "uploaded", "filename": filename})

@app.route("/detect-walls", methods=["POST"])
def detect_walls():
    data = request.json
    filename = data.get("filename")
    img_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    img = cv2.imread(img_path)

    if img is None:
        return jsonify({"error": "Image read failure"}), 400

    scale = 1200 / img.shape[1] if img.shape[1] > 1200 else 1.0
    if scale != 1.0:
        img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 40, 140)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 90, minLineLength=80, maxLineGap=25)

    walls = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            walls.append({
                "type": "wall", 
                "x1": int(x1/scale), "y1": int(y1/scale), 
                "x2": int(x2/scale), "y2": int(y2/scale)
            })

    return jsonify({"status": "ok", "walls": walls})

if __name__ == "__main__":
    app.run(debug=True)