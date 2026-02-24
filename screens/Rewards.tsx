import React, { useState, useEffect } from 'react';
import { Trophy, Lock, Star, Sparkles, Target, TreePine, Users, Globe, Zap, TrendingDown, LineChart as LineChartIcon } from 'lucide-react';
import { ACHIEVEMENTS, CHALLENGES } from '../constants';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getCarbonStatsRealData, getCarbonImpactData } from '../services/api';
import { useApp } from '../contexts/AppContext';

// Custom animations and layout CSS
const animationStyles = `
  /* --- Proportional Box Layout --- */
  .stats-container {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
  }

  .stat-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 24px 8px;
    border-radius: 28px;
    aspect-ratio: 1 / 2.8; /* Key for the "tall" proportional look */
    text-align: center;
    min-width: 0;
  }

  /* --- Text & Icon Scaling --- */
  .stat-card .value {
    font-size: 1.8rem;
    font-weight: 800;
    margin: 10px 0;
  }

  .stat-card .label {
    font-size: 0.6rem;
    font-weight: 700;
    text-transform: uppercase;
    line-height: 1.2;
  }

  /* --- Colors --- */
  .bg-green  { background-color: #e8f9f2; color: #047857; }
  .bg-blue   { background-color: #eef8ff; color: #1e6b8a; }
  .bg-purple { background-color: #f3f1ff; color: #5b4db2; }
  .bg-orange { background-color: #fff8e6; color: #92400e; }

  /* --- Keyframes --- */
  @keyframes slideInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes treeGrow { 0% { transform: scaleY(0.8); opacity: 0.3; } 100% { transform: scaleY(1); opacity: 1; } }
  @keyframes spinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes peopleMultiply { 0% { transform: scale(0.5); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes zapFlow { 0% { transform: translateX(-5px); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateX(5px); opacity: 0; } }

  /* --- Animation Classes --- */
  .animate-slideInUp { animation: slideInUp 0.6s ease-out forwards; }
  .animate-treeGrow { animation: treeGrow 0.8s ease-out; }
  .animate-spinSlow { animation: spinSlow 12s linear infinite; }
  .animate-peopleMultiply { animation: peopleMultiply 0.8s ease-out; }
  .animate-zapFlow { animation: zapFlow 1.5s ease-in-out infinite; }

  .delay-100 { animation-delay: 0.1s; }
  .delay-200 { animation-delay: 0.2s; }
  .delay-300 { animation-delay: 0.3s; }
  .delay-400 { animation-delay: 0.4s; }

  /* --- Mobile Tweak --- */
  @media (max-width: 480px) {
    .stats-container { gap: 8px; }
    .stat-card { padding: 15px 5px; aspect-ratio: 1 / 2.9; }
    .stat-card .value { font-size: 1.4rem; }
    .stat-card .label { font-size: 0.55rem; }
  }
`;
type ViewMode = 'mobile' | 'tablet' | 'web';

interface RewardsProps {
  viewMode?: ViewMode;
}

interface CarbonStats {
  user: number;
  neighbors: number;
  national: number;
  trees: number;
  co2Saved: number;
}

interface CarbonImpactData {
  last_month_change: number; // percentage change
  tariff_reduced_kg: number;
  household_members: number;
  current_xp: number; // 0-100
}

interface Challenge {
  id: string;
  title: string;
  reward: number;
  progress: number;
  total: number;
  daysLeft: number;
}

const Rewards: React.FC<RewardsProps> = ({ viewMode = 'mobile' }) => {
  const isMobileView = viewMode === 'mobile';
  const { home, isAuthReady } = useApp();
  const [carbonStats, setCarbonStats] = useState<CarbonStats | null>(null);
  const [carbonImpact, setCarbonImpact] = useState<CarbonImpactData | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>(CHALLENGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady) {
      console.log('[Rewards] Not auth ready yet');
      return;
    }

    if (!home?.id) {
      console.warn('[Rewards] No home.id available');
      setError('Home data not available');
      setLoading(false);
      return;
    }

    let isMounted = true; // Prevent memory leak from async setState

    const fetchCarbonData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('[Rewards] Starting fetch with home.id:', home.id);
        
        const carbonData = await getCarbonStatsRealData(home.id);
        
        console.log('[Rewards] API returned carbonData:', carbonData);
        
        if (!isMounted) return;

        if (carbonData) {
          console.log('[Rewards] Setting carbon stats:', carbonData);
          setCarbonStats(carbonData);
          setError(null);
        } else {
          console.warn('[Rewards] carbonData is null');
          setError('Unable to calculate carbon stats');
          setCarbonStats(null);
        }
      } catch (error) {
        console.error('[Rewards] Exception during fetch:', error);
        if (isMounted) {
          setError(error instanceof Error ? error.message : 'Unknown error');
          setCarbonStats(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCarbonData();

    return () => {
      isMounted = false;
    };
  }, [home?.id, isAuthReady]);

  // Fetch carbon impact data
  useEffect(() => {
    if (!isAuthReady || !home?.id) {
      return;
    }

    const fetchImpactData = async () => {
      try {
        console.log('[Rewards] Fetching carbon impact data for home:', home.id);
        const impactData = await getCarbonImpactData(home.id);
        
        if (impactData) {
          console.log('[Rewards] Carbon impact data received:', impactData);
          setCarbonImpact(impactData);
        }
      } catch (error) {
        console.error('[Rewards] Failed to fetch carbon impact data:', error);
      }
    };

    fetchImpactData();
  }, [home?.id, isAuthReady]);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <style>{animationStyles}</style>
      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 sm:pb-32 overflow-y-auto h-screen">
        {/* Header - Responsive */}
        <div className="mb-3 sm:mb-8 animate-slideInLeft">
          <div className="flex items-center justify-between gap-2 sm:gap-4 mb-0.5 sm:mb-2">
            <h1 className="text-xl sm:text-4xl lg:text-5xl font-black bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent">
              Rewards
            </h1>
            <Trophy className="w-5 sm:w-8 lg:w-10 text-amber-400 animate-pulse flex-shrink-0" />
          </div>
          <p className="text-slate-600 text-xs sm:text-sm">Your carbon impact</p>
        </div>

        {/* Main CO2 Card - Responsive */}
        <div 
          className="rounded-xl sm:rounded-3xl p-3 sm:p-6 lg:p-8 mb-3 sm:mb-6 relative overflow-hidden shadow-2xl transition-all duration-300 hover:shadow-2xl animate-scaleIn group"
          style={{ 
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)',
          }}
        >
          {/* Animated overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 via-cyan-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Factory SVG - Responsive size */}
          <svg className="absolute -right-4 sm:-right-8 top-1 sm:top-4 w-32 sm:w-56 lg:w-64 h-32 sm:h-56 lg:h-64 opacity-15 sm:opacity-30 transition-opacity duration-500 drop-shadow-lg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="smokeGradPremium" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.7"/>
                <stop offset="100%" stopColor="#9ca3af" stopOpacity="0"/>
              </linearGradient>
              <filter id="factoryGlow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            
            {/* Main factory building */}
            <rect x="70" y="120" width="100" height="80" fill="#4b5563" rx="4" filter="url(#factoryGlow)"/>
            <rect x="70" y="120" width="100" height="8" fill="#2d3748" />
            
            {/* Building windows - Left section */}
            <rect x="80" y="135" width="12" height="12" fill="#1f2937"/>
            <rect x="80" y="155" width="12" height="12" fill="#1f2937"/>
            <rect x="80" y="175" width="12" height="12" fill="#1f2937"/>
            
            {/* Building windows - Center section (lit) */}
            <rect x="115" y="135" width="12" height="12" fill="#fbbf24" opacity="0.8"/>
            <rect x="115" y="155" width="12" height="12" fill="#fbbf24" opacity="0.8"/>
            <rect x="115" y="175" width="12" height="12" fill="#fbbf24" opacity="0.8"/>
            <rect x="115" y="135" width="12" height="12" fill="#fbbf24" opacity="0.3" rx="1"/>
            
            {/* Building windows - Right section */}
            <rect x="150" y="135" width="12" height="12" fill="#1f2937"/>
            <rect x="150" y="155" width="12" height="12" fill="#1f2937"/>
            <rect x="150" y="175" width="12" height="12" fill="#1f2937"/>
            
            {/* Tall Smokestack Left */}
            <rect x="50" y="40" width="20" height="90" fill="#5a6372" rx="3"/>
            <ellipse cx="60" cy="40" rx="12" ry="7" fill="#6b7280"/>
            
            {/* Tall Smokestack Right */}
            <rect x="170" y="55" width="20" height="75" fill="#5a6372" rx="3"/>
            <ellipse cx="180" cy="55" rx="12" ry="7" fill="#6b7280"/>
            
            {/* Medium Smokestack Center */}
            <rect x="115" y="70" width="16" height="60" fill="#6b7280" rx="3"/>
            <ellipse cx="123" cy="70" rx="10" ry="6" fill="#9ca3af"/>
            
            {/* Smoke clouds - Left stack */}
            <circle cx="55" cy="15" r="13" fill="url(#smokeGradPremium)"/>
            <circle cx="68" cy="10" r="15" fill="url(#smokeGradPremium)"/>
            <circle cx="78" cy="18" r="12" fill="url(#smokeGradPremium)"/>
            
            {/* Smoke clouds - Right stack */}
            <circle cx="175" cy="25" r="12" fill="url(#smokeGradPremium)"/>
            <circle cx="190" cy="18" r="14" fill="url(#smokeGradPremium)"/>
            <circle cx="202" cy="28" r="11" fill="url(#smokeGradPremium)"/>
            
            {/* Smoke clouds - Center stack */}
            <circle cx="118" cy="40" r="11" fill="url(#smokeGradPremium)"/>
            <circle cx="132" cy="33" r="13" fill="url(#smokeGradPremium)"/>
            <circle cx="145" cy="42" r="10" fill="url(#smokeGradPremium)"/>
            
            {/* Base platform */}
            <rect x="40" y="205" width="160" height="8" fill="#2d3748" rx="2"/>
            <rect x="42" y="207" width="156" height="3" fill="#1f2937" rx="1"/>
          </svg>
          
          <div className="relative z-10">
            {/* Badge */}
            <div className="mb-3 sm:mb-6">
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-2 rounded-full bg-gradient-to-r from-emerald-600/20 to-cyan-600/20 border border-emerald-500/30 backdrop-blur-sm">
                <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-white/70 text-xs font-bold uppercase tracking-wider">This Month</span>
              </div>
            </div>

            {/* Main number - Responsive text sizes */}
            <div className="flex items-baseline gap-1 sm:gap-2 mb-4 sm:mb-6">
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-emerald-600/20 via-cyan-600/20 to-emerald-600/20 rounded-lg blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="text-3xl sm:text-5xl lg:text-7xl font-black text-white transition-all duration-500 drop-shadow-lg relative z-10 animate-slideInUp delay-200"
                  style={{
                    textShadow: '0 0 30px rgba(16, 185, 129, 0.3), 0 0 60px rgba(6, 182, 212, 0.2)',
                  }}>
                  {loading ? (
                    <span className="animate-pulse">--</span>
                  ) : error ? (
                    <span className="text-sm">Error</span>
                  ) : carbonStats ? (
                    <span>{carbonStats.co2Saved}</span>
                  ) : (
                    <span>0</span>
                  )}
                </div>
              </div>
              <div className="text-lg sm:text-2xl font-bold pb-1 sm:pb-2 relative z-10 text-white/70">
                kg
              </div>
            </div>

            {/* Progress bar - Responsive */}
            <div className="flex-1 mb-4 sm:mb-6">
              <div className="text-white/50 text-xs font-semibold uppercase tracking-widest mb-2">Monthly Progress</div>
              <div className="h-0.5 sm:h-1.5 bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-500 rounded-full opacity-60 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-pulse" style={{ animationDuration: '2s' }} />
              </div>
            </div>

            {/* Stat indicators - Responsive grid */}
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {/* Monthly Average */}
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-2.5 sm:w-4 h-2.5 sm:h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 17"></polyline>
                    <polyline points="17 6 23 6 23 12"></polyline>
                  </svg>
                  <div className="text-white/50 text-[7px] sm:text-[9px] font-bold uppercase">Avg</div>
                </div>
                <div className="text-white font-bold text-[9px] sm:text-sm">{carbonStats ? Math.round(carbonStats.co2Saved) : 0}</div>
              </div>

              {/* Per Person */}
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-2.5 sm:w-4 h-2.5 sm:h-4 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                  <div className="text-white/50 text-[7px] sm:text-[9px] font-bold uppercase">Person</div>
                </div>
                <div className="text-white font-bold text-[9px] sm:text-sm">{carbonStats && carbonImpact && carbonImpact.household_members > 0 ? (carbonStats.co2Saved / carbonImpact.household_members).toFixed(1) : 0}</div>
              </div>

              {/* Efficiency Score */}
              <div className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                <div className="flex items-center gap-1 mb-1">
                  <svg className="w-2.5 sm:w-4 h-2.5 sm:h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                  </svg>
                  <div className="text-white/50 text-[7px] sm:text-[9px] font-bold uppercase">Score</div>
                </div>
                <div className="text-white font-bold text-[9px] sm:text-sm flex items-center">
                  <span className="inline-block w-1 h-1 rounded-full bg-emerald-400 mr-1"></span>
                  Good
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Metrics Section - Light Background */}
        <div className="bg-transparent px-0 sm:px-1 mb-6 sm:mb-8">
          {/* Secondary Metrics - Responsive Grid (match Insights cards) */}
          <div className={`grid gap-3 sm:gap-4 ${isMobileView ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {/* Trees Per Year */}
            <div className="group bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40 animate-slideInUp delay-100 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <div className="relative z-10 flex flex-col h-full">
              {/* Top row: icon + status pill */}
              <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center shadow-sm">
                  <TreePine className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-600" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-[9px] sm:text-[11px] font-semibold text-emerald-700 shadow-sm">
                  Trees Saved
                </span>
              </div>

              {/* Title + value */}
              <div className="mb-1.5 sm:mb-2.5">
                <p className="text-[10px] sm:text-xs font-semibold text-emerald-900/80 tracking-wide">Trees offset this year</p>
                <div className="relative mt-1 inline-flex items-baseline gap-1">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/16 to-emerald-600/18 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span
                    className="relative text-2xl sm:text-3xl lg:text-4xl font-extrabold text-emerald-900 tracking-tight"
                    style={{ textShadow: '0 0 18px rgba(16,185,129,0.25)' }}
                  >
                    {loading ? (
                      <span className="animate-pulse">--</span>
                    ) : carbonStats ? (
                      <span className="animate-slideInUp delay-200">{carbonStats.trees}</span>
                    ) : (
                      <span>0</span>
                    )}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 uppercase">
                    trees
                  </span>
                </div>
              </div>

              {/* Mini sparkline footer – with animated glow dot */}
              <div className="mt-auto pt-2 sm:pt-3 -mx-4 -mb-2">
                <div className="relative h-10 sm:h-11 w-full">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400/80 animate-ping" />
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{ value: 6 }, { value: 8 }, { value: 5 }, { value: 9 }, { value: 7 }]}>
                      <defs>
                        <linearGradient id="treesSparkInsight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#treesSparkInsight)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Annual Tonnes */}
          <div className="group bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40 animate-slideInUp delay-200 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <div className="relative z-10 flex flex-col h-full">
              {/* Top row: icon + status pill */}
              <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-2xl bg-gradient-to-br from-cyan-100 to-cyan-50 flex items-center justify-center shadow-sm">
                  <Globe className="w-4 sm:w-5 h-4 sm:h-5 text-cyan-600" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-cyan-50 text-[9px] sm:text-[11px] font-semibold text-cyan-800 shadow-sm">
                  CO₂ Saved
                </span>
              </div>

              {/* Title + value */}
              <div className="mb-1.5 sm:mb-2.5">
                <p className="text-[10px] sm:text-xs font-semibold text-cyan-900/80 tracking-wide">CO₂ saved per year</p>
                <div className="relative mt-1 inline-flex items-baseline gap-1">
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/16 to-cyan-600/18 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span
                    className="relative text-2xl sm:text-3xl lg:text-4xl font-extrabold text-cyan-900 tracking-tight"
                    style={{ textShadow: '0 0 18px rgba(6,182,212,0.25)' }}
                  >
                    {loading ? (
                      <span className="animate-pulse">--</span>
                    ) : carbonStats ? (
                      <span className="animate-slideInUp delay-300">
                        {(carbonStats.co2Saved * 12 / 1000).toFixed(2)}
                      </span>
                    ) : (
                      <span>0</span>
                    )}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold text-cyan-700 uppercase">
                    t CO₂
                  </span>
                </div>
              </div>

              {/* Mini sparkline footer */}
              <div className="mt-auto pt-2 sm:pt-3 -mx-4 -mb-2">
                <div className="relative h-10 sm:h-11 w-full">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400/80 animate-ping" />
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{ value: 4 }, { value: 6 }, { value: 5 }, { value: 7 }, { value: 6 }]}>
                      <defs>
                        <linearGradient id="tonnesSparkInsight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#tonnesSparkInsight)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Per Capita */}
          <div className="group bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40 animate-slideInUp delay-300 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <div className="relative z-10 flex flex-col h-full">
              {/* Top row: icon + status pill */}
              <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center shadow-sm">
                  <Users className="w-4 sm:w-5 h-4 sm:h-5 text-indigo-600" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-indigo-50 text-[9px] sm:text-[11px] font-semibold text-indigo-800 shadow-sm">
                  Per Person
                </span>
              </div>

              {/* Title + value */}
              <div className="mb-1.5 sm:mb-2.5">
                <p className="text-[10px] sm:text-xs font-semibold text-indigo-900/80 tracking-wide">CO₂ saved per person</p>
                <div className="relative mt-1 inline-flex items-baseline gap-1">
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500/16 to-indigo-600/18 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span
                    className="relative text-2xl sm:text-3xl lg:text-4xl font-extrabold text-indigo-900 tracking-tight"
                    style={{ textShadow: '0 0 18px rgba(79,70,229,0.25)' }}
                  >
                    {loading ? (
                      <span className="animate-pulse">--</span>
                    ) : carbonStats && carbonImpact && carbonImpact.household_members > 0 ? (
                      <span className="animate-slideInUp delay-300">
                        {(carbonStats.co2Saved / carbonImpact.household_members).toFixed(1)}
                      </span>
                    ) : (
                      <span>0</span>
                    )}
                  </span>
                  <span className="text-[10px] sm:text-xs font-semibold text-indigo-700 uppercase">
                    kg CO₂
                  </span>
                </div>
              </div>

              {/* Mini sparkline footer */}
              <div className="mt-auto pt-2 sm:pt-3 -mx-4 -mb-2">
                <div className="relative h-10 sm:h-11 w-full">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400/80 animate-ping" />
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{ value: 5 }, { value: 5.5 }, { value: 6 }, { value: 5.8 }, { value: 6.2 }]}>
                      <defs>
                        <linearGradient id="perPersonSparkInsight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#perPersonSparkInsight)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Tariff - Responsive */}
          {carbonImpact && carbonImpact.tariff_reduced_kg > 0 && (
            <div className="group bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40 animate-slideInUp delay-400 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
              <div className="relative z-10 flex flex-col h-full">
                {/* Top row: icon + status pill */}
                <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
                  <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 flex items-center justify-center shadow-sm">
                    <Zap className="w-4 sm:w-5 h-4 sm:h-5 text-amber-600" />
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-[9px] sm:text-[11px] font-semibold text-amber-800 shadow-sm">
                    Via Tariff
                  </span>
                </div>

                {/* Title + value */}
                <div className="mb-1.5 sm:mb-2.5">
                  <p className="text-[10px] sm:text-xs font-semibold text-amber-900/80 tracking-wide">Tariff CO₂ savings</p>
                  <div className="relative mt-1 inline-flex items-baseline gap-1">
                    <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/16 to-amber-600/18 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <span
                      className="relative text-2xl sm:text-3xl lg:text-4xl font-extrabold text-amber-900 tracking-tight"
                      style={{ textShadow: '0 0 18px rgba(245,158,11,0.35)' }}
                    >
                      {carbonImpact.tariff_reduced_kg}
                    </span>
                    <span className="text-[10px] sm:text-xs font-semibold text-amber-800 uppercase">
                      kg CO₂
                    </span>
                  </div>
                </div>

                {/* Mini sparkline footer */}
                <div className="mt-auto pt-2 sm:pt-3 -mx-4 -mb-2">
                  <div className="relative h-10 sm:h-11 w-full">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/80 animate-ping" />
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={[{ value: 3 }, { value: 4 }, { value: 3.5 }, { value: 4.2 }, { value: 4 }]}>
                        <defs>
                          <linearGradient id="tariffSparkInsight" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#tariffSparkInsight)" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* CO2 Trend Chart - Responsive */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl border border-slate-200 p-3 sm:p-6 lg:p-8 mb-6 sm:mb-8 animate-slideInUp delay-200 backdrop-blur-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-indigo-300/10 to-transparent rounded-full blur-3xl" />
          
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-8">
              <div>
                <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                  <div className="w-8 sm:w-12 h-8 sm:h-12 rounded-lg sm:rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center text-indigo-600 text-sm sm:text-base">
                    <LineChartIcon className="w-4 sm:w-6 h-4 sm:h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-sm sm:text-lg">Trend Analysis</h3>
                    <p className="text-xs text-slate-500">6 months data</p>
                  </div>
                </div>
              </div>
              <div className="px-3 sm:px-4 py-1 sm:py-2 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 border border-emerald-200 whitespace-nowrap">
                <span className="text-xs font-bold text-emerald-700">↓ 7.3% Better</span>
              </div>
            </div>

            {/* Chart - Responsive height */}
            <div className="h-48 sm:h-64 lg:h-72 w-full mb-4 sm:mb-6 bg-slate-50 rounded-lg sm:rounded-2xl p-2 sm:p-4 border border-slate-200 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={[
                    { month: 'Sep', value: 185 },
                    { month: 'Oct', value: 198 },
                    { month: 'Nov', value: 210 },
                    { month: 'Dec', value: 195 },
                    { month: 'Jan', value: 175 },
                    { month: 'Feb', value: carbonStats?.co2Saved || 0 },
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 'bold', fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis hide={true} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(79, 70, 229, 0.1)' }} 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 8px 16px rgba(0,0,0,0.1)', backgroundColor: '#ffffff' }}
                    formatter={(value) => [`${value} kg`, 'CO₂']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#4f46e5" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorValue)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Stats Grid - Responsive */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 rounded-lg sm:rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 border border-indigo-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="text-xs text-indigo-600 font-bold uppercase mb-1 sm:mb-2 tracking-wider">Avg Monthly</div>
                <div className="text-2xl sm:text-3xl font-bold text-indigo-900">193</div>
                <div className="text-xs text-indigo-600 mt-1">kg CO₂</div>
              </div>
              <div className="p-3 sm:p-4 rounded-lg sm:rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="text-xs text-emerald-600 font-bold uppercase mb-1 sm:mb-2 tracking-wider">Trend</div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-700">↓ 7.3%</div>
                <div className="text-xs text-emerald-600 mt-1">improving</div>
              </div>
              <div className="p-3 sm:p-4 rounded-lg sm:rounded-2xl bg-gradient-to-br from-cyan-50 to-cyan-100/50 border border-cyan-200/50 hover:shadow-lg transition-all duration-300 hover:scale-105">
                <div className="text-xs text-cyan-600 font-bold uppercase mb-1 sm:mb-2 tracking-wider">Total</div>
                <div className="text-2xl sm:text-3xl font-bold text-cyan-900">1.16T</div>
                <div className="text-xs text-cyan-600 mt-1">tonnes</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Rewards;