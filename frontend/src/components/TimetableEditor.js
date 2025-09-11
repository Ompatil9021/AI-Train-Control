// frontend/src/components/TimetableEditor.js

import React, { useState, useEffect } from 'react';

const TimetableEditor = () => {
    const [schedules, setSchedules] = useState([]);
    const [newTrain, setNewTrain] = useState({
        id: '', name: '', type: 'EXPRESS', priority: 10, speed: 120, departure_time_seconds: 0
    });

    const fetchSchedules = () => {
        fetch('http://127.0.0.1:5001/api/schedules')
            .then(response => response.json())
            .then(data => setSchedules(data))
            .catch(error => console.error("Error fetching schedules:", error));
    };

    useEffect(() => {
        fetchSchedules();
        const intervalId = setInterval(fetchSchedules, 5000); // Refresh schedules every 5 seconds
        return () => clearInterval(intervalId);
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewTrain(prevState => ({ ...prevState, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        fetch('http://127.0.0.1:5001/api/add_schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...newTrain,
                priority: parseInt(newTrain.priority),
                speed: parseInt(newTrain.speed),
                departure_time_seconds: parseInt(newTrain.departure_time_seconds),
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Train schedule added successfully!');
                fetchSchedules();
                setNewTrain({ id: '', name: '', type: 'EXPRESS', priority: 10, speed: 120, departure_time_seconds: 0 });
            } else { alert('Error adding schedule: ' + data.message); }
        })
        .catch(error => console.error("Error adding schedule:", error));
    };
    
    // --- NEW FEATURE: DELETE A SCHEDULE ---
    const handleDelete = (trainId) => {
        if (window.confirm(`Are you sure you want to delete the schedule for train ${trainId}?`)) {
            fetch(`http://127.0.0.1:5001/api/delete_schedule/${trainId}`, {
                method: 'DELETE',
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert(data.message);
                    fetchSchedules();
                } else {
                    alert('Error deleting schedule: ' + data.message);
                }
            })
            .catch(error => console.error("Error deleting schedule:", error));
        }
    };

    return (
        <div className="timetable-container">
            <h3>Schedule Editor</h3>
            <form onSubmit={handleSubmit} className="schedule-form">
                {/* ... (form inputs are unchanged) ... */}
                <input name="id" value={newTrain.id} onChange={handleInputChange} placeholder="Train ID (e.g., R123)" required />
                <input name="name" value={newTrain.name} onChange={handleInputChange} placeholder="Train Name" required />
                <select name="type" value={newTrain.type} onChange={handleInputChange}>
                    <option value="EXPRESS">EXPRESS</option>
                    <option value="GOODS">GOODS</option>
                </select>
                <input name="priority" type="number" value={newTrain.priority} onChange={handleInputChange} placeholder="Priority" required />
                <input name="speed" type="number" value={newTrain.speed} onChange={handleInputChange} placeholder="Speed (km/h)" required />
                <input name="departure_time_seconds" type="number" value={newTrain.departure_time_seconds} onChange={handleInputChange} placeholder="Departure (s)" required />
                <button type="submit">Add Schedule</button>
            </form>

            <table className="schedule-table">
                <thead>
                    <tr>
                        <th>ID</th><th>Name</th><th>Type</th><th>Priority</th><th>Speed</th><th>Departure (s)</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {schedules.map(train => (
                        <tr key={train.id}>
                            <td>{train.id}</td><td>{train.name}</td><td>{train.type}</td>
                            <td>{train.priority}</td><td>{train.speed}</td><td>{train.departure_time_seconds}</td>
                            <td>
                                <button onClick={() => handleDelete(train.id)} className="delete-button">Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default TimetableEditor;