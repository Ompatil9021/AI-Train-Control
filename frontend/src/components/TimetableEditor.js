// frontend/src/components/TimetableEditor.js
import React, { useState, useEffect } from 'react';

const STATIONS = [
  { name: "MUMBAI CST", pos_km: 0.0 },
  { name: "THANE", pos_km: 41.9 },
  { name: "KALYAN", pos_km: 85.5 },
  { name: "KARJAT", pos_km: 118.7 },
  { name: "LONAVALA", pos_km: 150.1 },
  { name: "PUNE", pos_km: 192.0 }
];

const TimetableEditor = () => {
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState({
    id: '', name: '', type: 'EXPRESS', priority: 1, speed: 80, departure_time_seconds: 0,
    start_station: STATIONS[0].name, end_station: STATIONS[STATIONS.length - 1].name
  });

  const fetchSchedules = () => {
    fetch('http://127.0.0.1:5001/api/schedules')
      .then(res => res.json())
      .then(data => setSchedules(data))
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchSchedules(); }, []);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.id || !form.name) { alert('Please provide Train ID and Train Name'); return; }
    fetch('http://127.0.0.1:5001/api/add_schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        fetchSchedules();
        setForm({
          id: '', name: '', type: 'EXPRESS', priority: 1, speed: 80, departure_time_seconds: 0,
          start_station: STATIONS[0].name, end_station: STATIONS[STATIONS.length - 1].name
        });
      } else alert(data.message || 'Error adding schedule');
    })
    .catch(err => console.error(err));
  };

  const handleDelete = (id) => {
    fetch(`http://127.0.0.1:5001/api/delete_schedule/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => fetchSchedules())
      .catch(err => console.error(err));
  };

  return (
    <div className="timetable-editor">
      <h3>Timetable Editor</h3>
      <form onSubmit={handleAdd} className="timetable-form">

        <label>
          Train ID
          <input value={form.id} onChange={e => setForm({...form, id: e.target.value})} />
        </label>

        <label>
          Train Name
          <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
        </label>

        <label>
          Train Type
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
            <option value="EXPRESS">EXPRESS</option>
            <option value="GOODS">GOODS</option>
            <option value="LOCAL">LOCAL</option>
          </select>
        </label>

        <label>
          Priority
          <input type="number" value={form.priority} onChange={e => setForm({...form, priority: parseInt(e.target.value||0)})} />
        </label>

        <label>
          Speed (km/h)
          <input type="number" value={form.speed} onChange={e => setForm({...form, speed: parseInt(e.target.value||0)})} />
        </label>

        <label>
          Departure Time (seconds)
          <input type="number" value={form.departure_time_seconds} onChange={e => setForm({...form, departure_time_seconds: parseInt(e.target.value||0)})} />
        </label>

        <label>
          Start Station
          <select value={form.start_station} onChange={e => setForm({...form, start_station: e.target.value})}>
            {STATIONS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>

        <label>
          End Station
          <select value={form.end_station} onChange={e => setForm({...form, end_station: e.target.value})}>
            {STATIONS.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>

        <button type="submit">Add / Update</button>
      </form>

      <h4>Existing Schedules</h4>
      <ul className="schedule-list">
        {schedules.map(s => (
          <li key={s.id}>
            <div>
              <strong>{s.id}</strong> — {s.name} ({s.type})<br/>
              Priority: {s.priority}, Speed: {s.speed} km/h<br/>
              Departure: {s.departure_time_seconds}s<br/>
              Route: {s.start_station || 'MUMBAI CST'} → {s.end_station || 'PUNE'}
            </div>
            <button onClick={() => handleDelete(s.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TimetableEditor;
