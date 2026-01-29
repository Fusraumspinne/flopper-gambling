'use client';

import React, { useState, useEffect } from 'react';

interface AccessGateProps {
  children: React.ReactNode;
}

const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkStatus = () => {
      try {
        if (typeof window !== 'undefined') {
          const localUser = localStorage.getItem('flopper_user_authorized');
          const localAdmin = localStorage.getItem('flopper_admin_authorized');
          if (localUser === 'true' || localAdmin === 'true') {
            setIsAuthorized(true);
            return;
          }
        }
      } catch (e) {
        
      }

      setIsAuthorized(false);
    };

    checkStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/gate/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        setIsAuthorized(true);

        try {
          if (typeof window !== 'undefined') {
            if (data && data.role === 'admin') {
              localStorage.setItem('flopper_admin_authorized', 'true');
            } else {
              localStorage.setItem('flopper_user_authorized', 'true');
            }
          }
        } catch (e) {
        }
      } else {
        setError(true);
        setPassword('');
        setTimeout(() => setError(false), 2000);
      }
    } catch (err) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#0f212e] flex items-center justify-center p-8 text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-indigo-500/10 blur-[140px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-[#2f4553] border-t-indigo-400 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">🎲</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Loading Flopper Gambling…</h1>
            <p className="text-[#b1bad3] mt-2">Access is being verified, please wait a moment</p>
          </div>
          <div className="w-64 h-2 bg-[#213743] rounded-full overflow-hidden">
            <div className="h-full w-1/2 bg-indigo-500 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#0f212e] flex flex-col items-center justify-center p-8 text-center">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-md w-full">
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className={`w-24 h-24 border-4 border-[#2f4553] border-t-indigo-400 rounded-full ${loading ? 'animate-spin' : 'animate-pulse'}`} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">🔐</span>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-extrabold bg-linear-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent mb-4">
          Access Restricted
        </h1>

        <p className="text-[#b1bad3] text-lg mb-8">
          Please enter the password to access Flopper Gambling
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
              disabled={loading}
              className={`w-full bg-[#213743] border border-[#2f4553] rounded-xl p-4 text-white focus:outline-none focus:border-indigo-500 transition-all text-center placeholder-[#557086] disabled:opacity-50`}
            />
            {error && (
              <p role="status" aria-live="polite" className="text-[#ffb4b4] text-sm mt-2">
                Incorrect password — please try again
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Unlock Access'}
          </button>
        </form>

        <p className="mt-8 text-sm text-[#557086]">
          If you don't have the password, please contact the administrator
        </p>
      </div>
    </div>
  );
};

export default AccessGate;