// ============================================================================
// AUTOM8 FRONTEND - LOGIN PAGE
// src/pages/LoginPage.jsx
// ============================================================================

import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { loginWithEmail, loginWithFacebook, error } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');
  const successMessage = location.state?.message;

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);
      
      // Navigate based on role
      const roleRoutes = {
        owner: '/dashboard/owner',
        brand_owner: '/dashboard/brand',
        brand_manager: '/dashboard/brand',
        manager: '/dashboard/manager',
        kitchen_staff: '/dashboard/kitchen',
        marketing: '/dashboard/marketing',
        captain: '/dashboard/captain',
        waiter: '/dashboard/kitchen',
      };
      
      navigate(roleRoutes[user.role] || '/');
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookLogin = async () => {
    setLocalError('');
    setLoading(true);

    try {
      await loginWithFacebook();
      // Redirect handled by Supabase after callback
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-teal-900 flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-teal-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-orange-400 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      {/* Login Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <svg className="w-24 h-24" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Firefly Infinity Logo SVG */}
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="50%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#fb923c" />
                </linearGradient>
              </defs>
              <path
                d="M 60 100 Q 60 50 100 50 Q 140 50 140 100 Q 140 150 100 150 Q 75 150 60 130 M 140 100 Q 140 50 180 50 Q 180 100 140 150 Q 140 100 140 100"
                stroke="url(#grad1)"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Autom8</h1>
          <p className="text-blue-200 text-lg">Restaurant Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 backdrop-blur-md bg-opacity-95">
          {/* Success / Error Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 text-sm font-medium">{successMessage}</p>
            </div>
          )}
          {(error || localError) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700 text-sm font-medium">{error || localError}</p>
            </div>
          )}

          {/* Email Login Form */}
          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-800">
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Facebook Login */}
          <button
            onClick={handleFacebookLogin}
            disabled={loading}
            className="w-full border-2 border-blue-500 text-blue-600 hover:bg-blue-50 font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.109 3a6 6 0 100 12 6 6 0 000-12zM0 9a9 9 0 1118 0A9 9 0 010 9zm6.75-3a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" />
            </svg>
            Sign in with Facebook
          </button>

          {/* Footer Links */}
          <div className="mt-8 text-center text-sm text-gray-600 border-t pt-6">
            <p>Need access? Ask your restaurant administrator or use forgot password above.</p>
            <p className="mt-2 text-xs text-gray-500">© 2024 Autom8 - All rights reserved</p>
          </div>
        </div>

        {/* Demo Credentials Info */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-blue-900 text-sm font-semibold mb-2">Demo Credentials:</p>
          <p className="text-blue-800 text-xs">
            <strong>Owner:</strong> owner@demo.com<br />
            <strong>Manager:</strong> manager@demo.com<br />
            <strong>Kitchen:</strong> kitchen@demo.com<br />
            <strong>Password:</strong> demo1234
          </p>
        </div>
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        
        .animate-blob {
          animation: blob 7s infinite;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
