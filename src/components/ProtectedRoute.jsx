import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// The public site's whole CTA is "Sign in" — but until this existed, anyone
// could type /dashboard (or /remediator, /mosca-timeline, /compliance-reports)
// directly and skip the login flow entirely. Login here is a lightweight
// local mock (see AuthContext), so this adds zero real friction — it just
// makes the "Sign in" gate actually mean something.
export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.hash }} />;
  }
  return children;
}
