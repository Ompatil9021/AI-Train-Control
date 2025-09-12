// frontend/src/components/ProfilePage.js

import React, { useState, useEffect } from 'react';

const ProfilePage = ({ user, onBack }) => {
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetch(`http://127.0.0.1:5001/api/users/${user.username}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        setProfileData(data.data);
                    }
                    setLoading(false);
                })
                .catch(() => setLoading(false));
        }
    }, [user]);

    if (loading) {
        return <div className="profile-container"><h2>Loading Profile...</h2></div>;
    }

    if (!profileData) {
        return (
            <div className="profile-container">
                <h2>Could not load profile.</h2>
                <button onClick={onBack}>Back to Dashboard</button>
            </div>
        );
    }

    return (
        <div className="profile-container">
            <button onClick={onBack} className="back-button">← Back to Dashboard</button>
            
            <div className="profile-card">
                <h2>My Profile</h2>
                <p><strong>Username:</strong> {profileData.user.username}</p>
                <p><strong>Role:</strong> {profileData.user.role}</p>
            </div>

            {user.role === 'admin' && profileData.employees && (
                <div className="admin-view">
                    <h3>All Employee Accounts</h3>
                    <table className="user-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Role</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profileData.employees.map(employee => (
                                <tr key={employee.username}>
                                    <td>{employee.username}</td>
                                    <td>{employee.role}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ProfilePage;
