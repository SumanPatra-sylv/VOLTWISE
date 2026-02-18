import React, { useState, useEffect } from 'react';
import { Home as HomeIcon, PieChart, Trophy, Settings, User, Smartphone, Tablet, Monitor, Zap } from 'lucide-react';
import { Tab } from './types';
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

type ViewMode = 'mobile' | 'tablet' | 'web';

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  const [viewMode, setViewMode] = useState<ViewMode>('mobile');

  // Simulate Initial App Load
  useEffect(() => {
    setTimeout(() => setLoading(false), 2000);
  }, []);

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-50 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="relative z-10 flex flex-col items-center">
            <div className="w-20 h-20 border-t-4 border-cyan-500 border-solid rounded-full animate-spin mb-6 shadow-glow"></div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-widest animate-pulse">VOLTWISE</h1>
        </div>
      </div>
    );
  }

  if (!onboardingComplete) {
    return <Onboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'Home': return <Home onNavigate={setActiveTab} viewMode={viewMode} />;
      case 'Insights': return <Insights viewMode={viewMode} />;
      case 'Rewards': return <Rewards viewMode={viewMode} />;
      case 'Control': return <Control viewMode={viewMode} />;
      case 'Profile': return <Profile viewMode={viewMode} onNavigate={setActiveTab} />;
      case 'Optimizer': return <TariffOptimizer onBack={() => setActiveTab('Home')} />;
      case 'SmartPlugSetup': return <SmartPlugSetup onBack={() => setActiveTab('Profile')} viewMode={viewMode} />;
      case 'BillHistory': return <BillHistory onBack={() => setActiveTab('Profile')} viewMode={viewMode} />;
      case 'Notifications': return <Notifications onBack={() => setActiveTab('Profile')} viewMode={viewMode} />;
      default: return <Home onNavigate={setActiveTab} viewMode={viewMode} />;
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-50 flex items-center justify-center text-slate-800 flex-col gap-4 p-4">
      {/* View Mode Switcher */}
      <div className="flex gap-2 bg-white rounded-full p-1 shadow-lg border border-slate-100 z-[100]">
        <ViewModeButton 
          active={viewMode === 'mobile'} 
          onClick={() => setViewMode('mobile')} 
          icon={Smartphone} 
          label="Mobile" 
        />
        <ViewModeButton 
          active={viewMode === 'tablet'} 
          onClick={() => setViewMode('tablet')} 
          icon={Tablet} 
          label="Tablet" 
        />
        <ViewModeButton 
          active={viewMode === 'web'} 
          onClick={() => setViewMode('web')} 
          icon={Monitor} 
          label="Web" 
        />
      </div>

      {/* Responsive Container */}
      <div 
        className={`bg-slate-50 relative overflow-hidden flex flex-col transition-all duration-500 rounded-[3rem] shadow-2xl border border-slate-200 ${
          viewMode === 'mobile' 
            ? 'h-[calc(100vh-100px)] w-full md:h-[960px] md:w-[480px]' 
            : viewMode === 'tablet'
            ? 'h-[calc(100vh-100px)] w-full md:w-[820px] md:h-[600px] md:rounded-2xl'
            : 'h-[calc(100vh-100px)] w-full'
        }`}
      >
        
        {/* Background Gradient Orbs (Subtle for Light Mode) - Only show on mobile for performance */}
        {viewMode === 'mobile' && (
          <>
            <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-100/50 rounded-full blur-[80px] pointer-events-none mix-blend-multiply"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-emerald-100/50 rounded-full blur-[80px] pointer-events-none mix-blend-multiply"></div>
          </>
        )}

        {/* Main Content Area */}
        <main className="flex-1 relative z-10 overflow-hidden">
          {renderScreen()}
        </main>

        {/* Floating Optimize Button - Always visible on Home tab */}
        {activeTab === 'Home' && (
          <button 
            onClick={() => setActiveTab('Optimizer')}
            className={`absolute z-[55] hover:scale-110 active:scale-95 transition-all border border-slate-700 bg-slate-900 text-white shadow-xl shadow-slate-300 flex items-center justify-center rounded-[20px] group ${
              viewMode === 'mobile' ? 'w-14 h-14 bottom-28 right-4' : 'w-11 h-11 bottom-28 right-4'
            }`}
          >
            <Zap className={`fill-yellow-400 text-yellow-400 group-hover:animate-bounce ${viewMode === 'mobile' ? 'w-7 h-7' : 'w-5 h-5'}`} />
          </button>
        )}

        {/* Bottom Navigation (Floating Glass) */}
        {!['Optimizer', 'SmartPlugSetup', 'BillHistory', 'Notifications'].includes(activeTab) && (
          <nav className="absolute bottom-6 left-4 right-4 h-20 bg-white/80 backdrop-blur-xl border border-white/40 rounded-[2rem] flex justify-around items-center px-2 z-50 shadow-soft">
              <NavButton active={activeTab === 'Home'} onClick={() => setActiveTab('Home')} icon={HomeIcon} label="Home" />
              <NavButton active={activeTab === 'Insights'} onClick={() => setActiveTab('Insights')} icon={PieChart} label="Insights" />
              <NavButton active={activeTab === 'Rewards'} onClick={() => setActiveTab('Rewards')} icon={Trophy} label="Rewards" />
              <NavButton active={activeTab === 'Control'} onClick={() => setActiveTab('Control')} icon={Settings} label="Control" />
              <NavButton active={activeTab === 'Profile'} onClick={() => setActiveTab('Profile')} icon={User} label="Profile" />
          </nav>
        )}
      </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon: Icon, label }: any) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-14 h-14 transition-all duration-300 rounded-2xl ${active ? '-translate-y-2' : 'hover:bg-slate-100'}`}
  >
    <div className={`p-3 rounded-2xl transition-all duration-300 ${active ? 'bg-slate-900 text-white shadow-lg scale-110' : 'text-slate-400'}`}>
        <Icon className="w-6 h-6" strokeWidth={active ? 2.5 : 2} />
    </div>
  </button>
);

const ViewModeButton = ({ active, onClick, icon: Icon, label }: any) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
      active 
        ? 'bg-slate-900 text-white shadow-md' 
        : 'text-slate-500 hover:bg-slate-100'
    }`}
  >
    <Icon className="w-4 h-4" />
    <span className="text-xs font-semibold">{label}</span>
  </button>
);

export default App;