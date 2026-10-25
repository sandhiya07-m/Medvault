import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { ROLE_LABEL } from '../lib/util.js';

export default function Navbar() {
  const { user, logout } = useAuth();
  const staff = user.role !== 'admin';
  return (
    <header className="navbar">
      <div className="nav-inner">
        <div className="brand"><span className="brand-mark">+</span> MedVault</div>
        <nav className="nav-links" aria-label="Main">
          {staff && <NavLink to="/patients">Patients</NavLink>}
          {staff && <NavLink to="/sync">Sync Center</NavLink>}
          {user.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="nav-user">
          <div className="who"><strong>{user.name}</strong><span>{ROLE_LABEL[user.role]} · {user.facility}</span></div>
          <button className="btn ghost small" onClick={logout} title="Locks the app. Data stays encrypted on this device.">Lock / Sign out</button>
        </div>
      </div>
    </header>
  );
}
