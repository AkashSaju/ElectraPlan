from flask import Flask, render_template, request, jsonify
import os
import cv2
import numpy as np
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))

TEMPLATE_DIR = os.path.join(PROJECT_ROOT, "templates")
STATIC_DIR = os.path.join(PROJECT_ROOT, "static")

UPLOAD_DIR = os.path.join(PROJECT_ROOT, "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)
app.config["UPLOAD_FOLDER"] = UPLOAD_DIR


# ---------------- Helpers (Outside Route) ----------------
def snap(val, step=10):
    return int(round(val / step) * step)


def normalize_line(x1, y1, x2, y2):
    # Keep a consistent ordering
    if (x1, y1) > (x2, y2):
        x1, y1, x2, y2 = x2, y2, x1, y1
    return x1, y1, x2, y2


def line_length(x1, y1, x2, y2):
    return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5


def is_similar(l1, l2, tol=15):
    return (
        abs(l1[0] - l2[0]) < tol and abs(l1[1] - l2[1]) < tol and
        abs(l1[2] - l2[2]) < tol and abs(l1[3] - l2[3]) < tol
    )


# ---------------- Routes ----------------
@app.route("/")
def home():
    return render_template("canvas.html")


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

    return jsonify({
        "status": "uploaded",
        "filename": filename
    })

@app.route("/detect-walls", methods=["POST"])
def detect_walls():
    data = request.json
    filename = data.get("filename")

    if not filename:
        return jsonify({"error": "filename missing"}), 400

    img_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    if not os.path.exists(img_path):
        return jsonify({"error": "file not found"}), 404

    img = cv2.imread(img_path)
    if img is None:
        return jsonify({"error": "unable to read image"}), 400

    # ✅ Resize (faster + more stable)
    scale = 1.0
    h, w = img.shape[:2]
    if w > 1200:
        scale = 1200 / w
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ✅ Better denoise for mobile photos
    gray = cv2.bilateralFilter(gray, 9, 75, 75)

    # ✅ Strong threshold for sketch lines
    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        21, 7
    )

    kernel = np.ones((3, 3), np.uint8)

    # ✅ Close gaps (wall continuity)
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=2)

    # ✅ Thicken walls
    dilated = cv2.dilate(closed, kernel, iterations=2)

    # ✅ Hough lines tuned for long walls
    lines = cv2.HoughLinesP(
        dilated,
        rho=1,
        theta=np.pi / 180,
        threshold=140,
        minLineLength=120,
        maxLineGap=25
    )

    def snap(val, step=12):
        return int(round(val / step) * step)

    def normalize_line(x1, y1, x2, y2):
        if (x1, y1) > (x2, y2):
            x1, y1, x2, y2 = x2, y2, x1, y1
        return x1, y1, x2, y2

    def length(x1, y1, x2, y2):
        return ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5

    # ✅ Keep only horizontal/vertical lines (engineering plans)
    def hv_only(x1, y1, x2, y2, tol=10):
        if abs(y2 - y1) <= tol:  # horizontal
            return x1, y1, x2, y1
        if abs(x2 - x1) <= tol:  # vertical
            return x1, y1, x1, y2
        return None

    raw = []
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]

            hv = hv_only(x1, y1, x2, y2)
            if hv is None:
                continue

            x1, y1, x2, y2 = hv

            # snap endpoints to reduce duplicates
            x1, y1, x2, y2 = snap(x1), snap(y1), snap(x2), snap(y2)

            if length(x1, y1, x2, y2) < 80:
                continue

            x1, y1, x2, y2 = normalize_line(x1, y1, x2, y2)
            raw.append([x1, y1, x2, y2])

    # ✅ Merge collinear segments (simple merge)
    raw.sort(key=lambda l: (l[1], l[0], l[3], l[2]))

    merged = []
    for l in raw:
        if not merged:
            merged.append(l)
            continue

        last = merged[-1]

        # horizontal merge
        if l[1] == l[3] and last[1] == last[3] and l[1] == last[1]:
            if abs(l[0] - last[2]) <= 25:  # close gap
                last[2] = max(last[2], l[2])
                continue

        # vertical merge
        if l[0] == l[2] and last[0] == last[2] and l[0] == last[0]:
            if abs(l[1] - last[3]) <= 25:
                last[3] = max(last[3], l[3])
                continue

        merged.append(l)

    # ✅ Remove duplicates again
    unique = []
    for l in merged:
        dupe = False
        for u in unique:
            if abs(l[0] - u[0]) < 15 and abs(l[1] - u[1]) < 15 and abs(l[2] - u[2]) < 15 and abs(l[3] - u[3]) < 15:
                dupe = True
                break
        if not dupe:
            unique.append(l)

    # Convert back to original scale
    if scale != 1.0:
        for l in unique:
            l[0] = int(l[0] / scale)
            l[1] = int(l[1] / scale)
            l[2] = int(l[2] / scale)
            l[3] = int(l[3] / scale)

    walls = []
    for x1, y1, x2, y2 in unique:
        walls.append({
            "type": "wall",
            "x1": int(x1),
            "y1": int(y1),
            "x2": int(x2),
            "y2": int(y2)
        })

    return jsonify({
        "status": "ok",
        "walls": walls,
        "count": len(walls)
    })



@app.route("/save-plan", methods=["POST"])
def save_plan():
    data = request.json
    return jsonify({"status": "saved", "objects": len(data)})


if __name__ == "__main__":
    app.run(debug=True)
