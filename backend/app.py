# backend/app.py

import time
import threading
import os
import json
import ollama 
from flask import Flask, jsonify, request
from flask_cors import CORS

# --- CONFIGURATION (Recalculated to perfectly match the frontend map) ---
ROUTE_LENGTH_KM = 192.0

# Corrected KM positions based on the visual SVG map
STATIONS = [
    {"name": "MUMBAI CST", "pos_km": 0.0},
    {"name": "THANE", "pos_km": 41.9},
    {"name": "KALYAN", "pos_km": 85.5},
    {"name": "KARJAT", "pos_km": 118.7},
    {"name": "LONAVALA", "pos_km": 150.1},
    {"name": "PUNE", "pos_km": 192.0},
]

# Corrected loop line KM positions to match their stations
LOOP_LINES = {
    "Thane": STATIONS[1]["pos_km"],
    "Kalyan": STATIONS[2]["pos_km"],
    "Karjat": STATIONS[3]["pos_km"],
    "Lonavala": STATIONS[4]["pos_km"],
}

class Train:
    def __init__(self, train_id, name, train_type, priority, speed, start_position=0):
        self.id = train_id; self.name = name; self.type = train_type; self.priority = priority
        self.speed_kmh = speed; self.original_speed = speed; self.position_km = float(start_position)
        self.status = "ON_SCHEDULE"; self.halted_by = None; self.maneuver_target_km = None
    
    def move(self, delta_time_hours):
        if self.status in ["HALTED", "ARRIVED", "HALTED_IN_LOOP"]: return
        distance_to_move = self.speed_kmh * delta_time_hours
        potential_new_position = self.position_km + distance_to_move
        if self.status == "EN_ROUTE_TO_LOOP" and self.maneuver_target_km is not None:
            if potential_new_position >= self.maneuver_target_km:
                self.position_km = self.maneuver_target_km; self.status = "HALTED_IN_LOOP"; self.maneuver_target_km = None
                print(f"--- ACTION: Train {self.name} has reached the loop line and is now halting. ---")
                return
        if potential_new_position >= ROUTE_LENGTH_KM:
            self.position_km = ROUTE_LENGTH_KM; self.speed_kmh = 0; self.status = "ARRIVED"
            print(f"--- [Time {simulation.get_formatted_time()}] ARRIVED: Train {self.name} ---")
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
        return {
            "id": self.id, "name": self.name, "type": self.type, "priority": self.priority,
            "speed_kmh": self.speed_kmh, "position_km": round(self.position_km, 2), "status": self.status,
            "maneuver_target_km": self.maneuver_target_km,
            "halted_by": self.halted_by, # <-- ADD THIS LINE
            "upcoming_stations": upcoming,
            "next_station": upcoming[0]["name"] if upcoming else "None",
            "eta_next_station": upcoming[0]["eta_seconds"] if upcoming else None
        }

class Simulation:
    def __init__(self):
        self.trains = {}; self.simulation_time_seconds = 0; self.time_scale = 60
        self.lock = threading.Lock()
        self.schedule = [
            {"id": "G456", "name": "Goods Train", "type": "GOODS", "priority": 1, "speed": 70, "departure_time_seconds": 0},
            {"id": "R123", "name": "Rajdhani Exp", "type": "EXPRESS", "priority": 10, "speed": 120, "departure_time_seconds": 2400},
        ]
        self.spawned_train_ids = set(); self.conflicts_handled = set()

    def resolve_conflict_with_ai(self, behind_train, ahead_train, conflict_id):
        print(f"\n--- Conflict detected! Asking LOCAL AI for advice... ---\n")
        prompt = f"""
        Analyze the following railway conflict:
        - Train A: '{ahead_train.name}' ({ahead_train.id}), Priority: {ahead_train.priority}.
        - Train B: '{behind_train.name}' ({behind_train.id}), Priority: {behind_train.priority}.
        Based on priority, which single train should be instructed to wait?
        Provide your answer as a JSON object with one key: "train_id_to_wait".
        Example Response: {{"train_id_to_wait": "G456"}}
        """
        try:
            response = ollama.chat(model='phi3:latest', messages=[{'role': 'user', 'content': prompt}], format='json')
            advice = json.loads(response['message']['content'])
            print(f"--- LOCAL AI Advice Received: ---\n{advice}\n------------------------------------")

            with self.lock:
                train_id_to_wait = advice.get("train_id_to_wait")
                train_to_act = self.trains.get(train_id_to_wait)
                
                if not train_to_act or train_to_act.id != ahead_train.id:
                    print(f"--- AI provided an illogical plan. Overriding with safety logic. ---")
                    train_to_act = ahead_train
                
                best_loop_pos = None
                for name, pos in LOOP_LINES.items():
                    if pos > train_to_act.position_km:
                        best_loop_pos = pos; break
                
                if best_loop_pos:
                    time_for_waiter = (best_loop_pos - train_to_act.position_km) / train_to_act.speed_kmh if train_to_act.speed_kmh > 0 else float('inf')
                    time_for_passer = (best_loop_pos - behind_train.position_km) / behind_train.speed_kmh if behind_train.speed_kmh > 0 else float('inf')

                    if time_for_waiter < time_for_passer:
                        print(f"--- Plan is SAFE. Routing {train_to_act.name} to loop at {best_loop_pos}km. ---")
                        train_to_act.status = "EN_ROUTE_TO_LOOP"; train_to_act.maneuver_target_km = best_loop_pos; train_to_act.halted_by = behind_train.id
                    else:
                        print(f"--- Plan is UNSAFE! Overtake would occur. Executing fallback: HALT {train_to_act.name} NOW. ---")
                        train_to_act.status = "HALTED"; train_to_act.speed_kmh = 0; train_to_act.halted_by = behind_train.id
                else:
                     print(f"--- No available loop lines ahead. Halting {train_to_act.name} NOW. ---")
                     train_to_act.status = "HALTED"; train_to_act.speed_kmh = 0; train_to_act.halted_by = behind_train.id
        except Exception as e:
            print(f"!!! ERROR in AI resolution: {e} !!!")
            with self.lock:
                if conflict_id in self.conflicts_handled: self.conflicts_handled.remove(conflict_id)

    def check_for_resolved_conflicts(self):
        for train in list(self.trains.values()):
            if train.status in["HALTED_IN_LOOP","HALTED"]and train.halted_by:
                halting_train=self.trains.get(train.halted_by)
                if halting_train and halting_train.position_km>train.position_km+5:
                    print(f"--- CONFLICT RESOLVED: Restarting train {train.name}. ---")
                    train.status="ON_SCHEDULE";train.speed_kmh=train.original_speed;train.halted_by=None
                    train.maneuver_target_km=train.position_km
                    conflict_id=f"{halting_train.id}-{train.id}"
                    if conflict_id in self.conflicts_handled:self.conflicts_handled.remove(conflict_id)
    
    def detect_conflicts(self):
        train_list=list(self.trains.values());
        for i in range(len(train_list)):
            for j in range(i+1,len(train_list)):
                train_a,train_b=train_list[i],train_list[j]
                if train_a.status in["ARRIVED","HALTED","HALTED_IN_LOOP"]or train_b.status in["ARRIVED","HALTED","HALTED_IN_LOOP"]:continue
                ahead_train,behind_train=(train_a,train_b)if train_a.position_km>train_b.position_km else(train_b,train_a)
                if behind_train.priority>ahead_train.priority and behind_train.speed_kmh>ahead_train.speed_kmh:
                    distance=ahead_train.position_km-behind_train.position_km
                    if 40>distance>0:
                        conflict_id=f"{behind_train.id}-{ahead_train.id}"
                        if conflict_id not in self.conflicts_handled:
                            self.conflicts_handled.add(conflict_id)
                            ai_thread=threading.Thread(target=self.resolve_conflict_with_ai,args=(behind_train,ahead_train,conflict_id))
                            ai_thread.start()
    
    # --- THIS IS THE PERMANENTLY FIXED FUNCTION ---
    def spawn_trains(self):
        for train_data in self.schedule:
            if train_data["id"] not in self.spawned_train_ids and self.simulation_time_seconds >= train_data["departure_time_seconds"]:
                # This explicit version prevents the TypeError
                new_train = Train(
                    train_id=train_data["id"],
                    name=train_data["name"],
                    train_type=train_data["type"],
                    priority=train_data["priority"],
                    speed=train_data["speed"]
                )
                self.trains[train_data["id"]] = new_train
                self.spawned_train_ids.add(train_data["id"])
                print(f"--- [Time {self.get_formatted_time()}] SPAWNED: Train {new_train.name} ---")
    
    def update(self):
        while True:
            with self.lock:
                delta_t=1*self.time_scale/3600.0;self.simulation_time_seconds+=(1*self.time_scale)
                self.spawn_trains();
                for train in self.trains.values():train.move(delta_t)
                self.check_for_resolved_conflicts()
                self.detect_conflicts()
                print(self.get_state_string())
            time.sleep(1)
            
    def get_formatted_time(self):
        secs=int(self.simulation_time_seconds);mins,secs=divmod(secs,60);hours,mins=divmod(mins,60);return f"{hours:02d}:{mins:02d}:{secs:02d}"
    
    def get_state_string(self):
        time_str=self.get_formatted_time();state_str=f"--- Simulation Time: {time_str} ---"
        if not self.trains:state_str+="\nNo trains currently on the track."
        else:
            for train in self.trains.values():
                state_str+=f"\n  > {train.name} ({train.id}): Pos={train.position_km:.2f} km, Status={train.status}"
        return state_str
        
    def get_simulation_state_for_api(self):
        with self.lock:return {"simulation_time":self.get_formatted_time(),"trains":[train.to_dict() for train in self.trains.values()]}
app=Flask(__name__);CORS(app);simulation=Simulation()
@app.route('/api/get_simulation_state')
def get_simulation_state():return jsonify(simulation.get_simulation_state_for_api())
@app.route('/api/explain', methods=['POST'])
def get_explanation():
    """Receives the state of two trains and asks the AI to explain the situation."""
    try:
        data = request.get_json()
        ahead_train = data.get('ahead_train')
        behind_train = data.get('behind_train')

        if not ahead_train or not behind_train:
            return jsonify({"error": "Missing train data"}), 400

        prompt = f"""
        Explain the following railway situation in one simple sentence for a traffic controller.
        The low-priority train '{ahead_train['name']}' was halted.
        The high-priority train '{behind_train['name']}' was approaching from behind.
        Why was this action taken?
        """

        response = ollama.chat(
            model='phi3:latest',
            messages=[{'role': 'user', 'content': prompt}]
        )
        
        explanation = response['message']['content']
        return jsonify({"explanation": explanation})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__=='__main__':
    simulation_thread=threading.Thread(target=simulation.update,daemon=True);simulation_thread.start()
    app.run(port=5001,debug=True,use_reloader=False)