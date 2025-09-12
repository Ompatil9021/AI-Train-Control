// frontend/src/components/DecisionHistory.js

import React, { useState, useEffect } from 'react';

const DecisionHistory = ({ onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://127.0.0.1:5001/api/decision_history')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setHistory(data.history);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching decision history:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>Decision History / Audit Log</h2>
        <button onClick={onClose} className="close-button">✖ Close</button>
      </div>
      {loading ? (
        <p>Loading history...</p>
      ) : history.length === 0 ? (
        <p>No decisions recorded yet.</p>
      ) : (
        <ul className="history-list">
          {history.map((entry, idx) => (
            <li key={idx}>{entry}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DecisionHistory;
