// ============================================================================
// AUTOM8 FRONTEND - WEBSOCKET CONTEXT
// src/contexts/WebSocketContext.jsx
// ============================================================================

import React, { createContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext();

export function WebSocketProvider({ children }) {
  const { user } = useAuth();
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    if (!user) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = import.meta.env.VITE_WS_URL || 
      `${wsProtocol}//${import.meta.env.VITE_API_URL?.split('//')[1] || 'localhost:3001'}`;

    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      
      // Subscribe to restaurant updates
      websocket.send(JSON.stringify({
        type: 'SUBSCRIBE',
        userId: user.id,
        restaurantId: user.restaurant_id
      }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'SUBSCRIBED') {
        console.log('Subscribed to updates');
      } else {
        // Handle incoming updates
        setUpdates(prev => [data, ...prev.slice(0, 49)]); // Keep last 50 updates
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    };

    setWs(websocket);

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close();
      }
    };
  }, [user]);

  const send = useCallback((message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, [ws]);

  const value = {
    connected,
    updates,
    send,
    ws
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = React.useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}
