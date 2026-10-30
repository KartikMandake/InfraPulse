import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const DEMO_CREDENTIALS = {
  admin: { name: 'Sarah Chen', email: 'sarah.chen@infrapulse.io', password: 'Password123!', role: 'admin' },
  responder: { name: 'Marcus Vance', email: 'marcus.v@infrapulse.io', password: 'Password123!', role: 'responder' },
  viewer: { name: 'Alex Ross', email: 'alex.ross@infrapulse.io', password: 'Password123!', role: 'viewer' }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load existing session on mount
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const res = await api.getMe();
        if (isMounted && res?.data?.user) {
          setUser(res.data.user);
          setLoading(false);
          return;
        }
      } catch (err) {
        // No active session in cookies, auto-login as default demo admin for smooth local demo experience
        try {
          const loginRes = await api.login({
            email: DEMO_CREDENTIALS.admin.email,
            password: DEMO_CREDENTIALS.admin.password
          });
          if (isMounted && loginRes?.data?.user) {
            setUser(loginRes.data.user);
          }
        } catch (loginErr) {
          console.warn('[AuthContext] Demo auto-login skipped:', loginErr.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initSession();
    return () => { isMounted = false; };
  }, []);

  const login = async (email, password) => {
    setError(null);
    try {
      const res = await api.login({ email, password });
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const register = async ({ name, email, password }) => {
    setError(null);
    try {
      const res = await api.register({ name, email, password });
      setUser(res.data.user);
      return res.data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('[AuthContext] Logout failed:', err.message);
    } finally {
      setUser(null);
    }
  };

  const switchDemoUser = async (targetRole) => {
    const creds = DEMO_CREDENTIALS[targetRole];
    if (!creds) return;
    try {
      setLoading(true);
      const res = await api.login({ email: creds.email, password: creds.password });
      setUser(res.data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const role = user?.role || 'viewer';
  const isAdmin = role === 'admin';
  const isResponder = role === 'responder' || role === 'admin';
  const isViewer = role === 'viewer';

  const value = {
    user,
    role,
    isAdmin,
    isResponder,
    isViewer,
    isAuthenticated: !!user,
    loading,
    error,
    login,
    register,
    logout,
    switchDemoUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

