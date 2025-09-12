// frontend/src/components/AuthPage.js

import React, { useState } from 'react';

const AuthPage = ({ onLoginSuccess }) => {
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [formData, setFormData] = useState({ username: '', password: '', role: 'employee' });
    const [error, setError] = useState('');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prevState => ({ ...prevState, [name]: value }));
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
        .then(response => response.json())
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
        <div className="auth-container">
            <div className="auth-form">
                <h2>{isLoginMode ? 'Controller Login' : 'Register New User'}</h2>
                <form onSubmit={handleSubmit}>
                    <input type="text" name="username" placeholder="Username" value={formData.username} onChange={handleInputChange} required />
                    <input type="password" name="password" placeholder="Password" value={formData.password} onChange={handleInputChange} required />
                    {!isLoginMode && (
                        <select name="role" value={formData.role} onChange={handleInputChange}>
                            <option value="employee">Employee</option>
                            <option value="admin">Admin</option>
                        </select>
                    )}
                    {error && <p className="error-message">{error}</p>}
                    <button type="submit">{isLoginMode ? 'Login' : 'Register'}</button>
                </form>
                <p className="toggle-mode" onClick={() => setIsLoginMode(!isLoginMode)}>
                    {isLoginMode ? "Need an account? Register" : "Already have an account? Login"}
                </p>
            </div>
        </div>
    );
};

export default AuthPage;