# backend/app.py

import sqlite3
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
# --- Import our classes and config from the new logic file ---
from train_logic import Simulation, init_db, DATABASE_FILE
import ollama  # Needed for /api/explain

# Initialize Flask App
app = Flask(__name__)
CORS(app)
# This will hold our single simulation instance
simulation = None

# --- API Endpoints ---

@app.route('/api/get_simulation_state')
def get_simulation_state():
    return jsonify(simulation.get_simulation_state_for_api() if simulation else {"trains": [], "simulation_time": "00:00:00"})


@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    conn = sqlite3.connect(DATABASE_FILE); conn.row_factory = sqlite3.Row; cursor = conn.cursor()
    cursor.execute("SELECT * FROM schedules ORDER BY departure_time_seconds ASC"); rows = cursor.fetchall(); conn.close()
    return jsonify([dict(row) for row in rows])


@app.route('/api/add_schedule', methods=['POST'])
def add_schedule():
    data = request.get_json()
    try:
        conn = sqlite3.connect(DATABASE_FILE); cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO schedules (id, name, type, priority, speed, departure_time_seconds) VALUES (?, ?, ?, ?, ?, ?)",
                       (data['id'], data['name'], data['type'], data['priority'], data['speed'], data['departure_time_seconds']))
        conn.commit(); conn.close()
        if simulation:
            simulation.schedule = simulation.load_schedule_from_db()
        return jsonify({"success": True, "message": "Schedule added."}), 201
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@app.route('/api/delete_schedule/<train_id>', methods=['DELETE'])
def delete_schedule(train_id):
    try:
        conn = sqlite3.connect(DATABASE_FILE); cursor = conn.cursor()
        cursor.execute("DELETE FROM schedules WHERE id = ?", (train_id,)); conn.commit(); conn.close()
        if simulation:
            simulation.schedule = simulation.load_schedule_from_db()
        return jsonify({"success": True, "message": f"Schedule for train {train_id} deleted."})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role')

    if not username or not password or not role:
        return jsonify({"success": False, "message": "Missing required fields."}), 400

    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", (username, password, role))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"success": False, "message": "Username already exists."}), 409
    
    conn.close()
    return jsonify({"success": True, "message": "User registered successfully."}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if user and user['password'] == password:
        return jsonify({
            "success": True, 
            "message": "Login successful.",
            "user": {"username": user['username'], "role": user['role']}
        })
    else:
        return jsonify({"success": False, "message": "Invalid username or password."}), 401


@app.route('/api/explain', methods=['POST'])
def get_explanation():
    try:
        data = request.get_json()
        ahead_train = data.get('ahead_train')
        behind_train = data.get('behind_train')
        if not ahead_train or not behind_train:
            return jsonify({"error": "Missing train data"}), 400
        prompt = f"""Explain in one simple sentence: Why was the low-priority train '{ahead_train['name']}' halted for the high-priority train '{behind_train['name']}'?"""
        response = ollama.chat(model='phi3:latest', messages=[{'role': 'user', 'content': prompt}])
        return jsonify({"explanation": response['message']['content']})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/respond_to_decision', methods=['POST'])
def respond_to_decision():
    global simulation
    data = request.get_json()
    train_id = data.get('train_id')
    decision = data.get('decision')
    
    with simulation.lock:
        train = simulation.trains.get(train_id)
        if not train or not train.proposed_plan:
            return jsonify({"success": False, "message": "Train or plan not found."}), 404

        if decision == 'accept':
            print(f"--- User ACCEPTED plan for {train.name}. Executing... ---")
            simulation.log_decision(f"Controller ACCEPTED plan for {train.name}")
            plan = train.proposed_plan
            action = plan.get("action")
            
            train.halted_by = plan.get("caused_by")

            if action == "MOVE_TO_LOOP_AND_HALT":
                train.status = "EN_ROUTE_TO_LOOP"
                train.maneuver_target_km = plan.get("location_km")
            elif action == "HALT":
                train.status = "HALTED"
                train.speed_kmh = 0
        
        elif decision == 'reject':
            print(f"--- User REJECTED plan for {train.name}. Resuming normal operation. ---")
            simulation.log_decision(f"Controller REJECTED plan for {train.name}")
            train.status = "ON_SCHEDULE"
            if train.halted_by:
                conflict_id = f"{train.halted_by}-{train.id}"
                if conflict_id in simulation.conflicts_handled:
                    simulation.conflicts_handled.remove(conflict_id)
                train.halted_by = None
        
        train.proposed_plan = None
    return jsonify({"success": True})


@app.route('/api/decision_history', methods=['GET'])
def get_decision_history():
    if simulation:
        return jsonify({"success": True, "history": simulation.get_decision_history()})
    return jsonify({"success": False, "history": []})


@app.route('/api/users/<username>', methods=['GET'])
def get_user_profile(username):
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT role FROM users WHERE username = ?", (username,))
    requester = cursor.fetchone()

    if not requester:
        conn.close()
        return jsonify({"success": False, "message": "User not found."}), 404

    profile_data = {}
    
    cursor.execute("SELECT username, role FROM users WHERE username = ?", (username,))
    user_profile = cursor.fetchone()
    profile_data['user'] = dict(user_profile)

    if user_profile['role'] == 'admin':
        cursor.execute("SELECT username, role FROM users WHERE role = 'employee'")
        employees = cursor.fetchall()
        profile_data['employees'] = [dict(row) for row in employees]
        
    conn.close()
    return jsonify({"success": True, "data": profile_data})


if __name__ == '__main__':
    init_db()
    simulation = Simulation()
    simulation_thread = threading.Thread(target=simulation.update, daemon=True)
    simulation_thread.start()
    app.run(port=5001, debug=True, use_reloader=False)
