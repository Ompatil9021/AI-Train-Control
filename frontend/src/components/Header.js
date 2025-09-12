// frontend/src/components/Header.js
import React from 'react';
import './Header.css';

function Header({ user, onProfile, onHistory, onLogout }) {
  const initial = user?.username?.charAt(0).toUpperCase() || '?';

  return (
    <div className="header-bar">
      {/* Left: title */}
      <h1 className="app-title">AI Train Traffic Control</h1>

      {/* Right: avatar + buttons */}
      <div className="header-right">
        
        <div className="header-actions">
          <button onClick={onProfile}>Profile</button>
          <button onClick={onHistory}>Decision History</button>
          <button onClick={onLogout}>Logout</button>
        </div>
        <div className="user-circle">{initial}</div>
      </div>
    </div>
  );
}

export default Header;
