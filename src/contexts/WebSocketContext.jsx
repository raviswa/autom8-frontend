// ============================================================================
// AUTOM8 FRONTEND - WEBSOCKET CONTEXT
// src/contexts/WebSocketContext.jsx
// ============================================================================

import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { resolveWsBase } from '../config/api';

const WebSocketContext = createContext();

export function WebSocketProvider({ children }) {
  const { user, apiClient } = useAuth();
  const [ws, setWs] = useState(null);
  const [connected, setConnected] = useState(false);
  const [updates, setUpdates] = useState([]);
  const reconnectTimer = useRef(null);

  useEffect(() => {
    if (!user) {
      setConnected(false);
      setWs(null);
      return undefined;
    }

    let cancelled = false;
    let socket = null;

    const connect = async (attempt = 0) => {
      let restaurantId = user?.restaurant_id;

      if (!restaurantId && apiClient) {
        try {
          const res = await apiClient.get('/api/dashboard/waba');
          restaurantId = res.data?.restaurant?.id ?? null;
        } catch (_) {}
      }

      if (!restaurantId || cancelled) {
        setConnected(false);
        return;
      }

      const base = resolveWsBase();
      const wsUrl = `${base}?restaurant_id=${encodeURIComponent(restaurantId)}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (cancelled) return;
        console.log('[WebSocket] connected', restaurantId);
        setConnected(true);
        setWs(socket);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'CONNECTED' || data.type === 'SUBSCRIBED') return;
          setUpdates(prev => [data, ...prev.slice(0, 49)]);
        } catch (err) {
          console.error('[WebSocket] parse error:', err);
        }
      };

      socket.onerror = (error) => {
        console.error('[WebSocket] error:', error);
      };

      socket.onclose = () => {
        if (cancelled) return;
        console.log('[WebSocket] disconnected');
        setConnected(false);
        setWs(null);
        const delay = Math.min(30_000, 2_000 * (attempt + 1));
        reconnectTimer.current = setTimeout(() => connect(attempt + 1), delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (socket?.readyState === WebSocket.OPEN) socket.close();
    };
  }, [user, apiClient]);

  const send = useCallback((message) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, [ws]);

  const value = { connected, updates, send, ws };

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
