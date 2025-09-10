// frontend/src/TrainMap.js

import React from 'react';

const TrainMap = () => {
  // This is a helper function to draw a single, clear loop line at a station
  const createLoopLine = (id, centerX) => {
    const width = 120; // The length of the siding
    const curve = 20;  // The amount of curve
    const startX = centerX - (width / 2);
    const endX = centerX + (width / 2);
    const mainY = 151; // Y-position of the main track
    const loopY = 121; // Y-position of the loop track
    
    // This string is the command to draw the curved path for the siding
    const pathData = `M ${startX} ${mainY} C ${startX + curve} ${mainY}, ${startX + curve} ${loopY}, ${startX + (curve * 2)} ${loopY} L ${endX - (curve * 2)} ${loopY} C ${endX - curve} ${loopY}, ${endX - curve} ${mainY}, ${endX} ${mainY}`;
    
    return (
      <g key={id}>
        <path
          id={id}
          d={pathData}
          stroke="#555555"
          strokeWidth="3"
          fill="none"
          strokeDasharray="4,4"
        />
      </g>
    );
  };

  // An array defining all our stations and their positions
  const stations = [
    { x: 210, name: "MUMBAI CST" },
    { x: 450, name: "THANE" },
    { x: 700, name: "KALYAN" },
    { x: 890, name: "KARJAT" },
    { x: 1070, name: "LONAVALA" },
    { x: 1310, name: "PUNE" }
  ];

  return (
    <svg 
      width="100%" 
      height="250" 
      viewBox="0 0 1400 250" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ backgroundColor: '#f0f2f5', border: '1px solid #d9d9d9', borderRadius: '8px' }}
    >
      <title>Final Railway Route Map</title>
      
      {/* The Main Track */}
      <line id="main-track" x1="150" y1="151" x2="1370" y2="151" stroke="#333333" strokeWidth="5" />

      {/* This line automatically creates a loop line for each station */}
      {stations.map(station => createLoopLine(`loop-track-${station.name.toLowerCase().replace(' ', '')}`, station.x))}
      
      {/* This line draws the station circles and labels */}
      {stations.map(station => (
        <g key={station.name}>
          <ellipse cx={station.x} cy="151" rx="12" ry="12" fill="#007bff" stroke="#ffffff" strokeWidth="2" />
          <text x={station.x} y="185" fontFamily="Helvetica, Arial, sans-serif" fontSize="14px" fontWeight="bold" textAnchor="middle">{station.name}</text>
        </g>
      ))}
    </svg>
  );
};

export default TrainMap;