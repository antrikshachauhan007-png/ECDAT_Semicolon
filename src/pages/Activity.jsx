import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, RefreshCw, LogIn, Settings as SettingsIcon } from 'lucide-react';
import { useAuth, initials } from '../context/AuthContext.jsx';

const ACTIVITY = [
  { icon: LogIn, title: 'Signed in', detail: 'Session started', time: 'Just now' },
  { icon: Upload, title: 'Uploaded payments.internal.pem', detail: 'Flagged critical — RSA-2048', time: '12 minutes ago' },
  { icon: RefreshCw, title: 'Ran a live scan', detail: 'auth-service.pem — safe', time: '1 hour ago' },
  { icon: Upload, title: 'Uploaded network-scan-04.json', detail: 'Flagged moderate', time: '3 hours ago' },
  { icon: SettingsIcon, title: 'Updated notification preferences', detail: 'Enabled weekly digest', time: 'Yesterday' },
  { icon: Upload, title: 'Uploaded legacy-portal.crt', detail: 'Flagged critical — RSA-1024', time: '2 days ago' },
];

export default function Activity() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="sc-page">
      <style>{`
        .sc-page {
          --bg: #0a0d12; --surface-1: #12161d; --surface-2: #171c25;
          --border: #262e3a; --border-soft: #1b2129;
          --text-primary: #e8eaef; --text-secondary: #8a93a3; --text-faint: #545e6e; --gold: #c9a227;
          background: var(--bg); color: var(--text-primary); min-height: 100vh;
          font-family: 'Switzer', system-ui, sans-serif;
        }
        .sc-page *, .sc-page *::before, .sc-page *::after { box-sizing: border-box; }
        .sc-wrap { max-width: 720px; margin: 0 auto; padding: 40px 32px 100px; }
        .sc-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: var(--text-secondary); font-size: 13px; cursor: pointer; padding: 0; margin-bottom: 28px; font-family: inherit; }
        .sc-back:hover { color: var(--gold); }
        .sc-header { display: flex; align-items: center; gap: 14px; margin-bottom: 36px; }
        .sc-avatar { width: 46px; height: 46px; border-radius: 999px; background: rgba(201,162,39,0.14); color: var(--gold); display: flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace; font-weight: 600; font-size: 15px; }
        .sc-title { font-family: 'Clash Display', sans-serif; font-size: 26px; font-weight: 600; margin: 0; }
        .sc-sub { font-size: 13px; color: var(--text-secondary); margin: 3px 0 0; }
        .sc-timeline { border-top: 1px solid var(--border-soft); }
        .sc-item { display: flex; gap: 14px; padding: 16px 0; border-bottom: 1px solid var(--border-soft); }
        .sc-item-icon { width: 34px; height: 34px; border-radius: 8px; background: var(--surface-2); color: var(--gold); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sc-item-title { font-size: 14px; margin: 0; }
        .sc-item-detail { font-size: 12.5px; color: var(--text-secondary); margin: 3px 0 0; }
        .sc-item-time { font-size: 11.5px; color: var(--text-faint); margin-left: auto; white-space: nowrap; padding-top: 2px; }
      `}</style>

      <div className="sc-wrap">
        <button className="sc-back" onClick={() => navigate(-1)}><ArrowLeft size={14} /> Back</button>
        <div className="sc-header">
          <span className="sc-avatar">{user ? initials(user.name) : 'G'}</span>
          <div>
            <h1 className="sc-title">Profile activity</h1>
            <p className="sc-sub">Recent actions on {user ? user.name : 'your'} account</p>
          </div>
        </div>
        <div className="sc-timeline">
          {ACTIVITY.map((a, i) => {
            const Icon = a.icon;
            return (
              <div className="sc-item" key={i}>
                <span className="sc-item-icon"><Icon size={16} /></span>
                <div>
                  <p className="sc-item-title">{a.title}</p>
                  <p className="sc-item-detail">{a.detail}</p>
                </div>
                <span className="sc-item-time">{a.time}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
