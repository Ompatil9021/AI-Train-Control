# backend/train_logic.py

import time
import threading
import os
import json
import sqlite3
import ollama 

DATABASE_FILE = 'database.db'
ROUTE_LENGTH_KM = 192.0
STATIONS = [
    {"name": "MUMBAI CST", "pos_km": 0.0}, {"name": "THANE", "pos_km": 41.9},
    {"name": "KALYAN", "pos_km": 85.5}, {"name": "KARJAT", "pos_km": 118.7},
    {"name": "LONAVALA", "pos_km": 150.1}, {"name": "PUNE", "pos_km": 192.0},
]
LOOP_LINES = {
    "Thane": STATIONS[1]["pos_km"], "Kalyan": STATIONS[2]["pos_km"],
    "Karjat": STATIONS[3]["pos_km"], "Lonavala": STATIONS[4]["pos_km"],
}

def init_db():
    conn = sqlite3.connect(DATABASE_FILE); cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
            priority INTEGER NOT NULL, speed INTEGER NOT NULL, departure_time_seconds INTEGER NOT NULL
        )''')
    conn.commit(); conn.close()
    print("--- Database initialized successfully. ---")

class Train:
    def __init__(self, train_id, name, train_type, priority, speed, start_position=0):
        self.id = train_id; self.name = name; self.type = train_type; self.priority = priority
        self.speed_kmh = speed; self.original_speed = speed; self.position_km = float(start_position)
        self.status = "ON_SCHEDULE"; self.halted_by = None; self.maneuver_target_km = None
        self.time_in_adaptive_cruise = 0; self.proposed_plan = None
    
    def move(self, delta_time_hours, simulation_instance):
        if self.status in ["HALTED", "ARRIVED", "HALTED_IN_LOOP"]: return
        potential_new_position = self.position_km + (self.speed_kmh * delta_time_hours)
        if self.status == "EN_ROUTE_TO_LOOP" and self.maneuver_target_km is not None:
            if potential_new_position >= self.maneuver_target_km:
                self.position_km = self.maneuver_target_km; self.status = "HALTED_IN_LOOP"; self.maneuver_target_km = None
                print(f"--- ACTION: Train {self.name} has reached the loop line and is now halting. ---"); return
        if potential_new_position >= ROUTE_LENGTH_KM:
            self.position_km = ROUTE_LENGTH_KM; self.speed_kmh = 0; self.status = "ARRIVED"
            print(f"--- [Time {simulation_instance.get_formatted_time()}] ARRIVED: Train {self.name} ---")
        else: self.position_km = potential_new_position

    def get_upcoming_stations(self):
        upcoming = []
        for s in STATIONS:
            if s["pos_km"] > self.position_km:
                dist = s["pos_km"] - self.position_km
                eta_seconds = int((dist / self.speed_kmh) * 3600) if self.speed_kmh > 0 else None
                upcoming.append({"name": s["name"], "distance_km": round(dist, 1), "eta_seconds": eta_seconds})
        return upcoming

    def to_dict(self):
        upcoming = self.get_upcoming_stations()
        return {"id": self.id, "name": self.name, "type": self.type, "priority": self.priority,
                "speed_kmh": self.speed_kmh, "position_km": round(self.position_km, 2), "status": self.status,
                "maneuver_target_km": self.maneuver_target_km, "halted_by": self.halted_by,
                "proposed_plan": self.proposed_plan, "upcoming_stations": upcoming,
                "next_station": upcoming[0]["name"] if upcoming else "None",
                "eta_next_station": upcoming[0]["eta_seconds"] if upcoming else None}

class Simulation:
    def __init__(self):
        self.trains = {}; self.simulation_time_seconds = 0; self.time_scale = 60
        self.lock = threading.Lock(); self.schedule = self.load_schedule_from_db()
        self.spawned_train_ids = set(); self.conflicts_handled = set()

    def load_schedule_from_db(self):
        conn = sqlite3.connect(DATABASE_FILE); conn.row_factory = sqlite3.Row; cursor = conn.cursor()
        cursor.execute("SELECT * FROM schedules ORDER BY departure_time_seconds ASC"); rows = cursor.fetchall(); conn.close()
        return [dict(row) for row in rows]
    
    def resolve_conflict_with_ai(self, behind_train, ahead_train, conflict_id):
        print(f"\n--- Critical conflict! Asking LOCAL AI for advice... ---\n")
        prompt = f"""Analyze: High-priority '{behind_train.name}' is critically close to low-priority '{ahead_train.name}'. Loop lines are at: {json.dumps(LOOP_LINES)}. Advise which train should wait. Respond in JSON with "train_id_to_wait"."""
        try:
            response = ollama.chat(model='phi3:latest', messages=[{'role': 'user', 'content': prompt}], format='json')
            advice = json.loads(response['message']['content'])
            print(f"--- LOCAL AI Advice Received: ---\n{advice}\n------------------------------------")
            with self.lock:
                train_to_wait = self.trains.get(advice.get("train_id_to_wait"))
                if not train_to_wait or train_to_wait.id != ahead_train.id:
                    print(f"--- AI provided illogical advice. Overriding. ---"); train_to_wait = ahead_train
                
                best_loop_pos = next((pos for name, pos in LOOP_LINES.items() if pos > train_to_wait.position_km), None)
                plan = {}
                if best_loop_pos:
                    time_waiter = (best_loop_pos - train_to_wait.position_km) / train_to_wait.speed_kmh if train_to_wait.speed_kmh > 0 else float('inf')
                    time_passer = (best_loop_pos - behind_train.position_km) / behind_train.speed_kmh if behind_train.speed_kmh > 0 else float('inf')
                    if time_waiter < time_passer:
                        plan = {"action": "MOVE_TO_LOOP_AND_HALT", "train_id": train_to_wait.id, "location_km": best_loop_pos, "caused_by": behind_train.id}
                        print(f"--- Proposing a SAFE plan: Route {train_to_wait.name} to loop at {best_loop_pos}km. ---")
                    else:
                        plan = {"action": "HALT", "train_id": train_to_wait.id, "reason": "Maneuver unsafe", "caused_by": behind_train.id}
                        print(f"--- Proposing an UNSAFE fallback: HALT {train_to_wait.name} NOW. ---")
                else:
                    plan = {"action": "HALT", "train_id": train_to_wait.id, "reason": "No loop lines ahead", "caused_by": behind_train.id}
                    print(f"--- No loop lines ahead. Proposing fallback: HALT {train_to_wait.name} NOW. ---")

                train_to_wait.proposed_plan = plan
                train_to_wait.status = "AWAITING_DECISION"
        except Exception as e:
            print(f"!!! ERROR in AI resolution: {e} !!!")
            with self.lock:
                if conflict_id in self.conflicts_handled: self.conflicts_handled.remove(conflict_id)

    def check_for_resolved_conflicts(self):
        for train in list(self.trains.values()):
            if train.status in ["HALTED_IN_LOOP", "HALTED"] and train.halted_by:
                halting_train = self.trains.get(train.halted_by)
                if halting_train and halting_train.position_km > train.position_km + 5:
                    print(f"--- CONFLICT RESOLVED: Restarting train {train.name}. ---")
                    train.status = "ON_SCHEDULE"; train.speed_kmh = train.original_speed; train.halted_by = None
                    train.maneuver_target_km = train.position_km
                    conflict_id = f"{halting_train.id}-{train.id}"
                    if conflict_id in self.conflicts_handled: self.conflicts_handled.remove(conflict_id)
    
    def detect_conflicts(self):
        train_list = list(self.trains.values())
        currently_cruising_trains = set()
        for i in range(len(train_list)):
            for j in range(len(train_list)):
                if i == j: continue
                train_a, train_b = train_list[i], train_list[j]
                if train_a.status not in ["ON_SCHEDULE", "ADAPTIVE_CRUISE"] or train_b.status not in ["ON_SCHEDULE", "ADAPTIVE_CRUISE"]: continue
                ahead_train, behind_train = (train_a, train_b) if train_a.position_km > train_b.position_km else (train_b, train_a)
                if behind_train.original_speed > ahead_train.speed_kmh:
                    distance = ahead_train.position_km - behind_train.position_km
                    is_critically_close = 5 >= distance > 0
                    is_stuck_cruising = behind_train.status == "ADAPTIVE_CRUISE" and behind_train.time_in_adaptive_cruise > 300
                    if is_critically_close or is_stuck_cruising:
                        conflict_id = f"{behind_train.id}-{ahead_train.id}"
                        if conflict_id not in self.conflicts_handled:
                            self.conflicts_handled.add(conflict_id)
                            ai_thread = threading.Thread(target=self.resolve_conflict_with_ai, args=(behind_train, ahead_train, conflict_id))
                            ai_thread.start()
                        currently_cruising_trains.add(behind_train.id)
                    elif 15 > distance > 5:
                        if behind_train.status != "ADAPTIVE_CRUISE":
                            print(f"--- ACTION: {behind_train.name} entering ADAPTIVE_CRUISE. ---")
                            behind_train.status = "ADAPTIVE_CRUISE"
                        behind_train.speed_kmh = ahead_train.speed_kmh
                        currently_cruising_trains.add(behind_train.id)
        for train in train_list:
            if train.status == "ADAPTIVE_CRUISE" and train.id not in currently_cruising_trains:
                print(f"--- ACTION: {train.name} disengaging adaptive cruise. ---")
                train.status = "ON_SCHEDULE"; train.speed_kmh = train.original_speed

    def spawn_trains(self):
        self.schedule = self.load_schedule_from_db()
        for train_data in self.schedule:
            if train_data["id"] not in self.trains and self.simulation_time_seconds >= train_data["departure_time_seconds"]:
                new_train = Train(
                    train_id=train_data["id"], name=train_data["name"], train_type=train_data["type"],
                    priority=train_data["priority"], speed=train_data["speed"]
                )
                self.trains[train_data["id"]] = new_train
                print(f"--- [Time {self.get_formatted_time()}] SPAWNED: Train {new_train.name} ---")
    
    def update(self):
        while True:
            with self.lock:
                delta_t = 1 * self.time_scale / 3600.0; self.simulation_time_seconds += (1 * self.time_scale)
                self.spawn_trains();
                for train in self.trains.values(): train.move(delta_t, self)
                for train in self.trains.values():
                    if train.status == "ADAPTIVE_CRUISE": train.time_in_adaptive_cruise += (1 * self.time_scale)
                    else: train.time_in_adaptive_cruise = 0
                self.check_for_resolved_conflicts(); self.detect_conflicts(); print(self.get_state_string())
            time.sleep(1)
            
    def get_formatted_time(self):
        secs=int(self.simulation_time_seconds); mins,secs=divmod(secs,60); hours,mins=divmod(mins,60); return f"{hours:02d}:{mins:02d}:{secs:02d}"
    
    def get_state_string(self):
        time_str=self.get_formatted_time(); state_str=f"--- Simulation Time: {time_str} ---"
        if not self.trains: state_str += "\nNo trains currently on the track."
        else:
            for train in self.trains.values():
                state_str += f"\n  > {train.name} ({train.id}): Pos={train.position_km:.2f} km, Status={train.status}"
        return state_str
        
    # --- THIS IS THE MISSING FUNCTION THAT NEEDS TO BE ADDED BACK ---
    def get_simulation_state_for_api(self):
        with self.lock: return {"simulation_time": self.get_formatted_time(), "trains": [train.to_dict() for train in self.trains.values()]}