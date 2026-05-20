// ============================================================================
// AUTOM8 FRONTEND - AUTH CONTEXT
// src/contexts/AuthContext.jsx
// ============================================================================

import React, { createContext, useState, useCallback, useEffect } from 'react';
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
import axios from 'axios';

const AuthContext = createContext();

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  headers: {
    'Content-Type': 'application/json'
   }
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth from stored token + setup auto token refresh interceptor
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('authToken');
      const refreshTokenValue = localStorage.getItem('refreshToken');

      if (token) {
        try {
          const userData = JSON.parse(localStorage.getItem('userData'));
          setUser(userData);
          apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          // Restore Supabase session on page reload so RLS works for direct queries
          await supabase.auth.setSession({
            access_token:  token,
            refresh_token: refreshTokenValue,
          });

        } catch (err) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('userData');
          localStorage.removeItem('refreshToken');
        }
      }
      setLoading(false);
    };

    initAuth();

    // Axios interceptor: on 401/403, try to refresh token automatically
    const interceptor = apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
if ((error.response?.status === 401 || error.response?.status === 403) 
    && !originalRequest._retry 
    && !originalRequest.url?.includes('/api/auth/refresh')) {  // ← add this
  {
          originalRequest._retry = true;
          try {
            const refreshTokenValue = localStorage.getItem('refreshToken');
            if (!refreshTokenValue) throw new Error('No refresh token');

            const response = await apiClient.post('/api/auth/refresh', {
              refreshToken: refreshTokenValue
            });

            const { token, refreshToken: newRefreshToken } = response.data;
            localStorage.setItem('authToken', token);
            localStorage.setItem('refreshToken', newRefreshToken);
            apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            originalRequest.headers['Authorization'] = `Bearer ${token}`;

            // Refresh Supabase session too
            await supabase.auth.setSession({
              access_token:  token,
              refresh_token: newRefreshToken,
            });

            return apiClient(originalRequest);
          } catch (refreshErr) {
            // Refresh failed — clear and redirect to login
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
            localStorage.removeItem('refreshToken');
            delete apiClient.defaults.headers.common['Authorization'];
            await supabase.auth.signOut();
            setUser(null);
            return Promise.reject(refreshErr);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => apiClient.interceptors.response.eject(interceptor);
  }, []);

  const loginWithEmail = useCallback(async (email, password) => {
    setError(null);
    try {
      const response = await apiClient.post('/api/auth/login', { email, password });

      const { user: userData, token, refreshToken } = response.data;

      // Store tokens
      localStorage.setItem('authToken', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('userData', JSON.stringify(userData));

      // Set axios header
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Inject Supabase session so RLS works for direct queries
      await supabase.auth.setSession({
        access_token:  token,
        refresh_token: refreshToken,
      });

      setUser(userData);
      return userData;
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const loginWithFacebook = useCallback(async () => {
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      });

      if (signInError) throw signInError;
      return data;
    } catch (err) {
      const message = err.message || 'Facebook login failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const signup = useCallback(async (email, password, fullName, restaurantId) => {
    setError(null);
    try {
      const response = await apiClient.post('/api/auth/signup', {
        email,
        password,
        full_name: fullName,
        restaurant_id: restaurantId,
        role: 'kitchen_staff'
      });

      const { user: userData } = response.data;
      setUser(userData);
      return userData;
    } catch (err) {
      const message = err.response?.data?.error || 'Signup failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  const logout = useCallback(async () => {
    // Clear localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('refreshToken');

    // Clear axios header
    delete apiClient.defaults.headers.common['Authorization'];

    // Clear Supabase session
    await supabase.auth.signOut();

    setUser(null);
    setError(null);
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      const refreshTokenValue = localStorage.getItem('refreshToken');
      if (!refreshTokenValue) throw new Error('No refresh token');

      const response = await apiClient.post('/api/auth/refresh', {
        refreshToken: refreshTokenValue
      });

      const { token, refreshToken: newRefreshToken } = response.data;

      localStorage.setItem('authToken', token);
      localStorage.setItem('refreshToken', newRefreshToken);
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Refresh Supabase session too
      await supabase.auth.setSession({
        access_token:  token,
        refresh_token: newRefreshToken,
      });

      return token;
    } catch (err) {
      // Refresh failed, logout user
      await logout();
      throw err;
    }
  }, [logout]);

  const value = {
    user,
    loading,
    error,
    loginWithEmail,
    loginWithFacebook,
    signup,
    logout,
    refreshToken,
    apiClient
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
