// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import TrainMap from './TrainMap';
import TimetableEditor from './components/TimetableEditor';
import AuthPage from './components/AuthPage'; // NEW: Import the authentication page
import './App.css';

const getTrainIcon = (trainType) => {
  switch (trainType) {
    case 'EXPRESS': return '🚄';
    case 'GOODS': return '🚂';
    default: return '🚃';
  }
};

function App() {
  // --- NEW: State for managing the logged-in user ---
  const [user, setUser] = useState(null); 
  const [simulationState, setSimulationState] = useState({ trains: [], simulation_time: "00:00:00" });

  // --- UPDATED: Only fetch data if a user is logged in ---
  useEffect(() => {
    if (!user) return; // Don't do anything if we are not logged in

    const intervalId = setInterval(() => {
      fetch('http://127.0.0.1:5001/api/get_simulation_state')
        .then(response => response.json())
        .then(data => setSimulationState(data))
        .catch(error => console.error("Error fetching simulation state:", error));
    }, 1500);
    return () => clearInterval(intervalId);
  }, [user]); // This effect now depends on the 'user' state

  const handleExplainClick = (haltedTrain) => {
    // This function is unchanged
    const causingTrain = simulationState.trains.find(t => t.id === haltedTrain.halted_by);
    if (!causingTrain) {
      alert("Conflict details not available to generate explanation.");
      return;
    }
    fetch('http://127.0.0.1:5001/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ahead_train: haltedTrain, behind_train: causingTrain }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.explanation) { alert(data.explanation); } 
      else { alert("Sorry, could not get an explanation from the AI."); }
    })
    .catch(error => console.error("Error fetching explanation:", error));
  };

  const handleDecision = (trainId, decision) => {
    // This function is unchanged
    fetch('http://127.0.0.1:5001/api/respond_to_decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ train_id: trainId, decision: decision }),
    })
    .catch(error => console.error("Error sending decision:", error));
  };

  const getTrainPosition = (train) => {
    // This function is unchanged
    const SVG_WIDTH = 1400; const TRACK_START_X = 210; const TRACK_END_X = 1310;
    const ROUTE_LENGTH_KM = 192; const MAIN_TRACK_Y = 151; const LOOP_TRACK_Y = 121;
    const MANEUVER_DISTANCE_KM = 2.0;
    let percTraveled = train.position_km / ROUTE_LENGTH_KM;
    if (percTraveled > 1) percTraveled = 1; if (percTraveled < 0) percTraveled = 0;
    const trackWidthSvg = TRACK_END_X - TRACK_START_X;
    const trainPosSvg = TRACK_START_X + (percTraveled * trackWidthSvg);
    const finalXPerc = (trainPosSvg / SVG_WIDTH) * 100;
    let finalYPos = MAIN_TRACK_Y;
    const targetKm = train.maneuver_target_km;
    if ((train.status === 'EN_ROUTE_TO_LOOP' || train.status === 'HALTED_IN_LOOP') && targetKm) {
        const maneuverStartKm = targetKm - (MANEUVER_DISTANCE_KM / 2);
        if (train.position_km >= maneuverStartKm && train.position_km < targetKm) {
            const progress = (train.position_km - maneuverStartKm) / (MANEUVER_DISTANCE_KM / 2);
            finalYPos = MAIN_TRACK_Y - (progress * (MAIN_TRACK_Y - LOOP_TRACK_Y));
        } else if (train.position_km >= targetKm) {
            finalYPos = LOOP_TRACK_Y;
        }
    } else if (train.halted_by === null && targetKm) {
        const rejoinEndKm = targetKm + (MANEUVER_DISTANCE_KM / 2);
        if (train.position_km > targetKm && train.position_km <= rejoinEndKm) {
            const progress = (train.position_km - targetKm) / (MANEUVER_DISTANCE_KM / 2);
            finalYPos = LOOP_TRACK_Y + (progress * (MAIN_TRACK_Y - LOOP_TRACK_Y));
        } else if (train.position_km <= targetKm) {
            finalYPos = LOOP_TRACK_Y;
        }
    }
    return { left: `${finalXPerc}%`, top: `${finalYPos}px`, transform: `translate(-50%, -50%)` };
  };

  const formatEta = (seconds) => {
    // This function is unchanged
    if (seconds === null || seconds < 0) { return "N/A"; }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // --- NEW: Main Render Logic ---
  // If no user is logged in, show the AuthPage component.
  // We pass the 'setUser' function to it, so it can tell App.js when a login is successful.
  if (!user) {
    return <AuthPage onLoginSuccess={setUser} />;
  }

  // If a user IS logged in, show the main dashboard.
  return (
    <div className="App">
      {/* NEW: Header with user info and Logout button */}
      <div className="header">
        <h1>AI Train Traffic Control</h1>
        <div className="user-info">
          Logged in as: <strong>{user.username}</strong> ({user.role})
          <button onClick={() => setUser(null)} className="logout-button">Logout</button>
        </div>
      </div>
      <h2>Simulation Time: {simulationState.simulation_time}</h2>
      
      <div className="dashboard">
        <TrainMap />
        {simulationState.trains.map(train => (
          <div 
            key={train.id} 
            className="train-icon" 
            style={getTrainPosition(train)}
            title={`${train.name} (${train.id}) - Status: ${train.status}`}
          >
            {getTrainIcon(train.type)}
            <div className="train-label">{train.id}</div>
          </div>
        ))}
      </div>

      {/* FIX: Corrected the structure here */}
      <div className="train-list-container">
        <h3>Live Train Status</h3>
        <div className="train-cards-grid">
          {simulationState.trains.map(train => (
            <div key={train.id} className={`train-card type-${train.type} status-${train.status}`}>
              <h4>{getTrainIcon(train.type)} {train.name} ({train.id})</h4>
              <p><strong>Status:</strong> {train.status.replace(/_/g, ' ')}</p>
              
              {train.status === 'AWAITING_DECISION' && train.proposed_plan ? (
                <div className="decision-box">
                  <p><strong>AI Proposal:</strong> {train.proposed_plan.action.replace(/_/g, ' ')} at {train.proposed_plan.location_km}km</p>
                  <button onClick={() => handleDecision(train.id, 'accept')} className="accept-button">Accept</button>
                  <button onClick={() => handleDecision(train.id, 'reject')} className="reject-button">Reject</button>
                </div>
              ) : (
                <>
                  <p><strong>Speed:</strong> {train.speed_kmh} km/h</p>
                  <p><strong>Next Station:</strong> {train.next_station}</p>
                  <p><strong>ETA:</strong> {formatEta(train.eta_next_station)}</p>
                </>
              )}
              {(train.status === 'HALTED' || train.status === 'HALTED_IN_LOOP') && (
                <button onClick={() => handleExplainClick(train)} className="explain-button">
                  Explain Why?
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* NEW: Only show the TimetableEditor if the logged-in user's role is 'admin' */}
      {user && user.role === 'admin' && <TimetableEditor />}
    </div>
  );
}

export default App;