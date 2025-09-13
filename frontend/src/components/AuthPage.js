import React, { useState } from 'react';
import bgImage from '../assets/background.jpg'; // ✅ Make sure this file exists
import './AuthPage.css';

const AuthPage = ({ onLoginSuccess }) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '', role: 'employee' });
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    const body = isLoginMode
      ? { username: formData.username, password: formData.password }
      : { username: formData.username, password: formData.password, role: formData.role };

    fetch(`http://127.0.0.1:5001${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          if (isLoginMode) {
            onLoginSuccess(data.user);
          } else {
            alert('Registration successful! Please log in.');
            setIsLoginMode(true);
          }
        } else {
          setError(data.message);
        }
      })
      .catch(() => setError('An error occurred. Please try again.'));
  };

  return (
    <div
      className="auth-background"
      style={{ backgroundImage: `url(${bgImage})` }}
    >
      <div className="auth-card">
        <h1 className="auth-title">Pune Rail Operations Command Center</h1>
        <p className="auth-subtitle">
          Authorized access for locomotive pilots and operational staff.<br />
          Please log in to continue.
        </p>

        <div className="auth-divider" />

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <span className="icon">👤</span>
            <input
              type="text"
              name="username"
              placeholder="Operator ID"
              value={formData.username}
              onChange={handleInputChange}
              required
              autoComplete="username"
            />
          </div>

          <div className="input-group">
            <span className="icon">🔒</span>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <div className="error-box">{error}</div>}

          <button type="submit" className="auth-button">Secure Login</button>
        </form>

        <div className="auth-links">
          <a href="#">Forgot Password?</a>
          <p>
            Don’t have an account?{" "}
            <span
              className="toggle-link"
              onClick={() => setIsLoginMode(!isLoginMode)}
            >
              {isLoginMode ? "Request Access Credentials" : "Back to Login"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;