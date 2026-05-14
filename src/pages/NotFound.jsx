import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-teal-900 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="text-9xl font-bold mb-4 opacity-30">404</div>
        <h1 className="text-4xl font-bold mb-4">Page Not Found</h1>
        <p className="text-blue-200 mb-8">The page you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate('/login')}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg transition"
        >
          Back to Login
        </button>
      </div>
    </div>
  );
}
