import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Navbar from './components/Navbar.jsx';
import SyncBanner from './components/SyncBanner.jsx';
import Login from './pages/Login.jsx';
import Patients from './pages/Patients.jsx';
import PatientRegister from './pages/PatientRegister.jsx';
import PatientRecord from './pages/PatientRecord.jsx';
import SyncCenter from './pages/SyncCenter.jsx';
import Admin from './pages/Admin.jsx';

const Guard = ({ roles, children }) => {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
};

export default function App() {
  const { user } = useAuth();
  if (!user) return <Login />;
  const staff = ['healthworker', 'doctor'];
  return (
    <>
      <div className="topbar">
        <Navbar />
        <SyncBanner showSync={user.role !== 'admin'} />
      </div>
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to={user.role === 'admin' ? '/admin' : '/patients'} replace />} />
          <Route path="/patients" element={<Guard roles={staff}><Patients /></Guard>} />
          <Route path="/patients/new" element={<Guard roles={staff}><PatientRegister /></Guard>} />
          <Route path="/patients/:uid" element={<Guard roles={staff}><PatientRecord /></Guard>} />
          <Route path="/patients/:uid/edit" element={<Guard roles={staff}><PatientRegister /></Guard>} />
          <Route path="/sync" element={<Guard roles={staff}><SyncCenter /></Guard>} />
          <Route path="/admin" element={<Guard roles={['admin']}><Admin /></Guard>} />
          <Route path="*" element={<div className="card"><h1>Page not found</h1></div>} />
        </Routes>
      </main>
    </>
  );
}
