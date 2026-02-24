import React from 'react';
import { Routes, Route, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Home as HomeIcon, PieChart, Trophy, Settings, User, Smartphone, Tablet, Monitor, Zap } from 'lucide-react';
import { useApp } from './contexts/AppContext';
import ErrorBoundary from './components/ErrorBoundary';

// ── Screen Imports ─────────────────────────────────────────────────
import Home from './screens/Home';
import Insights from './screens/Insights';
import Rewards from './screens/Rewards';
import Control from './screens/Control';
import Profile from './screens/Profile';
import TariffOptimizer from './screens/TariffOptimizer';
import Onboarding from './screens/Onboarding';
import SmartPlugSetup from './screens/SmartPlugSetup';
import BillHistory from './screens/BillHistory';
import Notifications from './screens/Notifications';
import AdminDashboard from './screens/AdminDashboard';

// ── Types ──────────────────────────────────────────────────────────
type ViewMode = 'mobile' | 'tablet' | 'web';

// ── Splash Screen ──────────────────────────────────────────────────
const SplashScreen: React.FC = () => (
  <div className="h-screen w-screen bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden">
    <div className="relative z-10 flex flex-col items-center">
      <div className="w-20 h-20 border-t-4 border-cyan-500 border-solid rounded-full animate-spin mb-6 shadow-glow"></div>
      <h1 className="text-2xl font-bold text-slate-800 tracking-widest animate-pulse">VOLTWISE</h1>
    </div>
  </div>
);

// ── Route Wrappers (for sub-pages that need navigate back) ─────────
const OptimizerRoute: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  return <TariffOptimizer onBack={() => navigate('/')} />;
};

const SmartPlugRoute: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  return <SmartPlugSetup onBack={() => navigate('/profile')} viewMode={viewMode} />;
};

const BillHistoryRoute: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  return <BillHistory onBack={() => navigate('/profile')} viewMode={viewMode} />;
};

const NotificationsRoute: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  return <Notifications onBack={() => navigate('/profile')} viewMode={viewMode} />;
};

// ── Main App ───────────────────────────────────────────────────────
const App: React.FC = () => {
  const { viewMode, setViewMode, user, profile, isLoading, isAuthReady } = useApp();

  // Show splash while checking auth
  if (isLoading || !isAuthReady) {
    return <SplashScreen />;
  }

  // Show onboarding if: not logged in OR logged in but hasn't completed onboarding
  if (!user || !profile?.onboarding_done) {
    return <Onboarding />;
  }

  // Admin users get a separate dashboard
  if (profile.role === 'admin' || profile.role === 'super_admin') {
    return <AdminDashboard />;
  }

  return (
    <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-slate-800 flex-col md:gap-4 md:p-4">
      {/* View Mode Switcher — hidden on actual mobile, visible on desktop for demo */}
      <div className="hidden md:flex gap-2 bg-white rounded-full p-1 shadow-lg border border-slate-100 z-[100]">
        <ViewModeButton active={viewMode === 'mobile'} onClick={() => setViewMode('mobile')} icon={Smartphone} label="Mobile" />
        <ViewModeButton active={viewMode === 'tablet'} onClick={() => setViewMode('tablet')} icon={Tablet} label="Tablet" />
        <ViewModeButton active={viewMode === 'web'} onClick={() => setViewMode('web')} icon={Monitor} label="Web" />
      </div>

      {/* Responsive Container
          - On actual mobile (<md): full screen, no frame, no rounded corners
          - On desktop (md+): phone/tablet/web frame preview */}
      <div
        className={`bg-slate-50 relative overflow-hidden flex flex-col transition-all duration-500 
          w-full h-screen md:h-[calc(100vh-100px)]
          md:rounded-[3rem] md:shadow-2xl md:border md:border-slate-200
          ${viewMode === 'mobile'
            ? 'md:w-[480px] md:max-h-[960px]'
            : viewMode === 'tablet'
              ? 'md:w-[820px] md:max-h-[600px] md:rounded-2xl'
              : ''
          }`}
      >
        {/* Background Gradient Orbs (Subtle for Light Mode) */}
        {viewMode === 'mobile' && (
          <>
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-100/50 rounded-full blur-[80px] pointer-events-none mix-blend-multiply"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-emerald-100/50 rounded-full blur-[80px] pointer-events-none mix-blend-multiply"></div>
          </>
        )}

        {/* Main Content Area */}
        <main className="flex-1 relative z-10 overflow-hidden">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomeWithNav viewMode={viewMode} />} />
              <Route path="/insights" element={<Insights viewMode={viewMode} />} />
              <Route path="/rewards" element={<Rewards viewMode={viewMode} />} />
              <Route path="/control" element={<Control viewMode={viewMode} />} />
              <Route path="/profile" element={<ProfileWithNav viewMode={viewMode} />} />
              <Route path="/optimizer" element={<OptimizerRoute viewMode={viewMode} />} />
              <Route path="/smart-plug-setup" element={<SmartPlugRoute viewMode={viewMode} />} />
              <Route path="/bill-history" element={<BillHistoryRoute viewMode={viewMode} />} />
              <Route path="/notifications" element={<NotificationsRoute viewMode={viewMode} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Floating Optimize Button */}
        <FloatingOptimizeButton viewMode={viewMode} />

        {/* Bottom Navigation */}
        <BottomNav viewMode={viewMode} />
      </div>
    </div>
  );
};

// ── Home & Profile wrappers (they need navigate function) ──────────
const HomeWithNav: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  const handleNavigate = (tab: string) => {
    const routes: Record<string, string> = {
      Home: '/',
      Insights: '/insights',
      Rewards: '/rewards',
      Control: '/control',
      Profile: '/profile',
      Optimizer: '/optimizer',
      SmartPlugSetup: '/smart-plug-setup',
      BillHistory: '/bill-history',
      Notifications: '/notifications',
    };
    navigate(routes[tab] || '/');
  };
  return <Home onNavigate={handleNavigate as any} viewMode={viewMode} />;
};

const ProfileWithNav: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  const handleNavigate = (tab: string) => {
    const routes: Record<string, string> = {
      SmartPlugSetup: '/smart-plug-setup',
      BillHistory: '/bill-history',
      Notifications: '/notifications',
    };
    navigate(routes[tab] || '/profile');
  };
  return <Profile viewMode={viewMode} onNavigate={handleNavigate as any} />;
};

// ── Floating Optimize Button ───────────────────────────────────────
const FloatingOptimizeButton: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const navigate = useNavigate();
  // Only show on home page — we detect via location
  // For simplicity, always render it; the route will handle show/hide
  return (
    <NavLink to="/optimizer">
      {({ isActive }) =>
        !isActive ? (
          <button
            onClick={() => navigate('/optimizer')}
            className={`absolute z-[55] hover:scale-110 active:scale-95 transition-all border border-slate-700 bg-slate-900 text-white shadow-xl shadow-slate-300 flex items-center justify-center rounded-[20px] group ${viewMode === 'mobile' ? 'w-14 h-14 bottom-28 right-4' : 'w-11 h-11 bottom-28 right-4'
              }`}
          >
            <Zap className={`fill-yellow-400 text-yellow-400 group-hover:animate-bounce ${viewMode === 'mobile' ? 'w-7 h-7' : 'w-5 h-5'}`} />
          </button>
        ) : null
      }
    </NavLink>
  );
};

// ── Bottom Navigation ──────────────────────────────────────────────
const HIDDEN_NAV_ROUTES = ['/optimizer', '/smart-plug-setup', '/bill-history', '/notifications'];

const BottomNav: React.FC<{ viewMode: ViewMode }> = ({ viewMode }) => {
  const location = useLocation();
  const isHidden = HIDDEN_NAV_ROUTES.includes(location.pathname);

  if (isHidden) return null;

  return (
    <nav className="fixed bottom-4 left-4 right-4 h-16 md:absolute md:bottom-6 md:left-4 md:right-4 md:h-20 bg-white/80 backdrop-blur-xl border border-white/40 rounded-2xl md:rounded-[2rem] flex justify-around items-center px-2 z-50 shadow-soft">
      <NavButton to="/" icon={HomeIcon} label="Home" />
      <NavButton to="/insights" icon={PieChart} label="Insights" />
      <NavButton to="/rewards" icon={Trophy} label="Rewards" />
      <NavButton to="/control" icon={Settings} label="Control" />
      <NavButton to="/profile" icon={User} label="Profile" />
    </nav>
  );
};

// ── Nav Button (uses NavLink for active state) ─────────────────────
const NavButton = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => (
  <NavLink
    to={to}
    className="flex flex-col items-center justify-center w-14 h-14 transition-all duration-300 rounded-2xl"
  >
    {({ isActive }) => (
      <div className={`flex flex-col items-center justify-center w-14 h-14 transition-all duration-300 rounded-2xl ${isActive ? '-translate-y-2' : 'hover:bg-slate-100'}`}>
        <div className={`p-3 rounded-2xl transition-all duration-300 ${isActive ? 'bg-slate-900 text-white shadow-lg scale-110' : 'text-slate-400'}`}>
          <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
        </div>
      </div>
    )}
  </NavLink>
);

// ── View Mode Button ───────────────────────────────────────────────
const ViewModeButton = ({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${active
      ? 'bg-slate-900 text-white shadow-md'
      : 'text-slate-500 hover:bg-slate-100'
      }`}
  >
    <Icon className="w-4 h-4" />
    <span className="text-xs font-semibold">{label}</span>
  </button>
);

export default App;