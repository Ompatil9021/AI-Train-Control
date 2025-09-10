// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import TrainMap from './TrainMap';
import './App.css';

const getTrainIcon = (trainType) => {
  switch (trainType) {
    case 'EXPRESS': return '🚄';
    case 'GOODS': return '🚂';
    default: return '🚃';
  }
};

function App() {
  const [simulationState, setSimulationState] = useState({ trains: [], simulation_time: "00:00:00" });

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetch('http://127.0.0.1:5001/api/get_simulation_state')
        .then(response => response.json())
        .then(data => setSimulationState(data))
        .catch(error => console.error("Error fetching simulation state:", error));
    }, 1500);
    return () => clearInterval(intervalId);
  }, []);

  // --- HELPER FUNCTIONS MOVED TO THE CORRECT PLACE ---

  const handleExplainClick = (haltedTrain) => {
    // Find the high-priority train that caused the halt
    const causingTrain = simulationState.trains.find(t => t.id === haltedTrain.halted_by);
    
    if (!causingTrain) {
      alert("Conflict details not available to generate explanation.");
      return;
    }

    fetch('http://127.0.0.1:5001/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ahead_train: haltedTrain,  // The train that was told to wait
        behind_train: causingTrain // The train that was approaching
      }),
    })
    .then(response => response.json())
    .then(data => {
      if (data.explanation) {
        alert(data.explanation); // Show the explanation in a simple popup
      } else {
        alert("Sorry, could not get an explanation from the AI.");
      }
    })
    .catch(error => console.error("Error fetching explanation:", error));
  };

  const getTrainPosition = (train) => {
    const SVG_WIDTH = 1400; const TRACK_START_X = 210; const TRACK_END_X = 1310;
    const ROUTE_LENGTH_KM = 192; const MAIN_TRACK_Y = 151; const LOOP_TRACK_Y = 121;
    const MANEUVER_DISTANCE_KM = 5.0;

    let percTraveled = train.position_km / ROUTE_LENGTH_KM;
    if (percTraveled > 1) percTraveled = 1; if (percTraveled < 0) percTraveled = 0;
    
    const trackWidthSvg = TRACK_END_X - TRACK_START_X;
    const trainPosSvg = TRACK_START_X + (percTraveled * trackWidthSvg);
    const finalXPerc = (trainPosSvg / SVG_WIDTH) * 100;

    let finalYPos = MAIN_TRACK_Y;
    const targetKm = train.maneuver_target_km;

    if (train.status === 'EN_ROUTE_TO_LOOP' && targetKm) {
        const maneuverStartKm = targetKm - MANEUVER_DISTANCE_KM;
        if (train.position_km >= maneuverStartKm) {
            const progress = (train.position_km - maneuverStartKm) / MANEUVER_DISTANCE_KM;
            if (progress >= 0 && progress <= 1) {
                finalYPos = MAIN_TRACK_Y - (progress * (MAIN_TRACK_Y - LOOP_TRACK_Y));
            } else if (progress > 1) {
                finalYPos = LOOP_TRACK_Y;
            }
        }
    } else if (train.status === 'HALTED_IN_LOOP') {
        finalYPos = LOOP_TRACK_Y;
    } else if (train.halted_by === null && targetKm) {
        const rejoinEndKm = targetKm + MANEUVER_DISTANCE_KM;
        if (train.position_km < rejoinEndKm) {
            const progress = (train.position_km - targetKm) / MANEUVER_DISTANCE_KM;
            if (progress >= 0 && progress <= 1) {
                finalYPos = LOOP_TRACK_Y + (progress * (MAIN_TRACK_Y - LOOP_TRACK_Y));
            }
        }
    }
    
    return { left: `${finalXPerc}%`, top: `${finalYPos}px` };
  };

  const formatEta = (seconds) => {
    if (seconds === null || seconds < 0) {
      return "N/A";
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };


  return (
    <div className="App">
      <h1>AI Train Traffic Control</h1>
      <h2>Simulation Time: {simulationState.simulation_time}</h2>
      
      <div className="dashboard">
        <TrainMap />
        {simulationState.trains.map(train => {
          const position = getTrainPosition(train);
          return (
            <div 
              key={train.id} 
              className="train-icon" 
              style={{ left: position.left, top: position.top }}
              title={`${train.name} (${train.id}) - Status: ${train.status}`}
            >
              {getTrainIcon(train.type)}
              <div className="train-label">{train.id}</div>
            </div>
          );
        })}
      </div>

      <div className="train-list-container">
        <h3>Live Train Status</h3>
        <div className="train-cards-grid">
          {simulationState.trains.map(train => (
            <div key={train.id} className={`train-card type-${train.type}`}>
              <h4>{getTrainIcon(train.type)} {train.name} ({train.id})</h4>
              <p><strong>Status:</strong> {train.status.replace('_', ' ')}</p>
              <p><strong>Speed:</strong> {train.speed_kmh} km/h</p>
              <p><strong>Position:</strong> {train.position_km} km</p>
              <p><strong>Next Station:</strong> {train.next_station}</p>
              <p><strong>ETA:</strong> {formatEta(train.eta_next_station)}</p>

              {/* --- THIS IS THE BUTTON CODE, NOW ADDED --- */}
              {(train.status === 'HALTED' || train.status === 'HALTED_IN_LOOP') && (
                <button 
                  onClick={() => handleExplainClick(train)}
                  className="explain-button"
                >
                  Explain Why?
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;