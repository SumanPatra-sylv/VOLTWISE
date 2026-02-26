import React, { useState, useEffect } from 'react';
import { Globe, Users, Zap, TrendingDown, TrendingUp, ArrowDownRight, ArrowUpRight, Scale } from 'lucide-react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getCarbonDashboard, CarbonDashboardData } from '../services/api';
import { useApp } from '../contexts/AppContext';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface RewardsProps {
  viewMode?: ViewMode;
}

const Rewards: React.FC<RewardsProps> = ({ viewMode = 'mobile' }) => {
  const isMobileView = viewMode === 'mobile';
  const { home, isAuthReady } = useApp();
  const [data, setData] = useState<CarbonDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthReady || !home?.id) {
      if (isAuthReady && !home?.id) {
        setError('Home data not available');
        setLoading(false);
      }
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await getCarbonDashboard(home.id);
        if (!isMounted) return;
        if (result) {
          setData(result);
        } else {
          setError('Unable to load carbon data');
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [home?.id, isAuthReady]);

  return (
    <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900">
      <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-32 overflow-y-auto h-full no-scrollbar">

        {/* Header */}
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-3 mb-0.5">
            <h1 className="text-xl sm:text-3xl font-bold text-slate-800">Carbon Impact</h1>
            <Globe className="w-5 sm:w-7 text-cyan-500 flex-shrink-0" />
          </div>
          <p className="text-slate-500 text-xs sm:text-sm">Your environmental footprint this month</p>
        </div>

        {/* ── Hero Card: Total CO₂ Emitted ─────────────────────────── */}
        <div
          className="rounded-[2rem] p-4 sm:p-6 mb-4 sm:mb-6 relative overflow-hidden shadow-soft"
          style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)' }}
        >
          {/* Subtle factory silhouette */}
          <svg className="absolute -right-6 top-2 w-28 sm:w-44 h-28 sm:h-44 opacity-10" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
            <rect x="70" y="120" width="100" height="80" fill="#4b5563" rx="4" />
            <rect x="50" y="40" width="20" height="90" fill="#5a6372" rx="3" />
            <rect x="170" y="55" width="20" height="75" fill="#5a6372" rx="3" />
            <rect x="115" y="70" width="16" height="60" fill="#6b7280" rx="3" />
            <circle cx="55" cy="15" r="13" fill="#4b5563" opacity="0.6" />
            <circle cx="68" cy="10" r="15" fill="#4b5563" opacity="0.5" />
            <circle cx="175" cy="25" r="12" fill="#4b5563" opacity="0.6" />
            <circle cx="190" cy="18" r="14" fill="#4b5563" opacity="0.5" />
            <rect x="40" y="205" width="160" height="8" fill="#2d3748" rx="2" />
          </svg>

          <div className="relative z-10">
            {/* Badge */}
            <div className="mb-3 sm:mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
                <span className="text-white/60 text-[10px] sm:text-xs font-semibold uppercase tracking-wider">Total Emissions</span>
              </div>
            </div>

            {/* Main value */}
            <div className="flex items-baseline gap-1.5 mb-3 sm:mb-4">
              <span className="text-3xl sm:text-5xl font-black text-white">
                {loading ? '--' : error ? '—' : data?.totalEmittedKg ?? 0}
              </span>
              <span className="text-base sm:text-xl font-semibold text-white/50">kg CO₂</span>
              {data && data.monthChangePercent !== 0 && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${data.monthChangePercent < 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {data.monthChangePercent < 0 ? '↓' : '↑'} {Math.abs(data.monthChangePercent)}%
                </span>
              )}
            </div>

            {/* Progress indicator */}
            <div className="mb-3 sm:mb-4">
              <div className="text-white/40 text-[10px] font-semibold uppercase tracking-widest mb-1.5">from {data?.monthlyKwh ?? 0} kWh consumed</div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, ((data?.totalEmittedKg ?? 0) / 250) * 100)}%` }} />
              </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-1 mb-0.5">
                  <Users className="w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 text-cyan-400" />
                  <span className="text-white/40 text-[7px] sm:text-[9px] font-semibold uppercase">Per Person</span>
                </div>
                <span className="text-white font-bold text-[10px] sm:text-sm">{data?.perCapitaKg ?? 0} kg</span>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-1 mb-0.5">
                  <Zap className="w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 text-amber-400" />
                  <span className="text-white/40 text-[7px] sm:text-[9px] font-semibold uppercase">kWh Used</span>
                </div>
                <span className="text-white font-bold text-[10px] sm:text-sm">{data?.monthlyKwh ?? 0}</span>
              </div>
              <div className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center gap-1 mb-0.5">
                  <Users className="w-2.5 sm:w-3.5 h-2.5 sm:h-3.5 text-indigo-400" />
                  <span className="text-white/40 text-[7px] sm:text-[9px] font-semibold uppercase">Members</span>
                </div>
                <span className="text-white font-bold text-[10px] sm:text-sm">{data?.householdMembers ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Bento Grid: Key Metrics ──────────────────────────────── */}
        <div className={`grid gap-3 mb-4 sm:mb-6 ${isMobileView ? 'grid-cols-2' : 'grid-cols-3'}`}>

          {/* Card 1: Total CO₂ This Month */}
          <div className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col justify-between h-36">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-cyan-50 flex items-center justify-center">
                <Globe className="w-4 h-4 text-cyan-600" />
              </div>
              <span className="text-[9px] font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">Emitted</span>
            </div>
            <div>
              <p className="text-[10px] font-medium text-slate-400 mb-0.5">Total CO₂ this month</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-slate-800">
                  {loading ? '--' : data?.totalEmittedKg ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">kg</span>
              </div>
            </div>
          </div>

          {/* Card 2: % Change vs Last Month */}
          <div className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col justify-between h-36">
            <div className="flex items-start justify-between">
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${(data?.monthChangePercent ?? 0) <= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                {(data?.monthChangePercent ?? 0) <= 0
                  ? <TrendingDown className="w-4 h-4 text-emerald-600" />
                  : <TrendingUp className="w-4 h-4 text-rose-600" />
                }
              </div>
              <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${(data?.monthChangePercent ?? 0) <= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>
                {(data?.monthChangePercent ?? 0) <= 0 ? 'Improving' : 'Up'}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-medium text-slate-400 mb-0.5">vs Last Month</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-extrabold ${(data?.monthChangePercent ?? 0) <= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {loading ? '--' : `${data?.monthChangePercent ?? 0}%`}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: CO₂ Reduced via Load Shifting */}
          <div className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col justify-between h-36">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-amber-50 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Shifted</span>
            </div>
            <div>
              <p className="text-[10px] font-medium text-slate-400 mb-0.5">CO₂ saved via shifting</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-amber-700">
                  {loading ? '--' : data?.co2ReducedViaShiftKg ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">kg</span>
              </div>
            </div>
          </div>

          {/* Card 4: Per Capita CO₂ */}
          <div className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col justify-between h-36">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-[9px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">{data?.householdMembers ?? 4} members</span>
            </div>
            <div>
              <p className="text-[10px] font-medium text-slate-400 mb-0.5">Per capita CO₂</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-indigo-700">
                  {loading ? '--' : data?.perCapitaKg ?? 0}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">kg/person</span>
              </div>
            </div>
          </div>


        </div>

        {/* ── Daily CO₂ Trend (Real DB Data) ───────────────────────── */}
        {data && data.trendData.length > 0 && (
          <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-sm sm:text-lg font-bold text-slate-800">Daily CO₂ Trend</h3>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium">kg CO₂ from daily_aggregates — last 30 days</p>
              </div>
            </div>
            <div className="h-40 sm:h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trendData}>
                  <defs>
                    <linearGradient id="colorCarbon" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} dy={10} interval={"preserveStartEnd"} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
                    cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                    formatter={(value: number) => [`${value} kg`, 'CO₂']}
                  />
                  <Area type="monotone" dataKey="carbonKg" stroke="#0ea5e9" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCarbon)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Optimization Comparison ──────────────────────────────── */}
        <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-4 sm:p-5 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 flex items-center justify-center">
              <Scale className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Optimization Impact</h3>
              <p className="text-[11px] text-slate-400">What if you didn't shift load?</p>
            </div>
          </div>

          {data && data.kwhShifted > 0 ? (
            <div className="space-y-2">
              {/* Shifted kWh info */}
              <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">kWh shifted (Peak → Off-Peak)</span>
                  <span className="text-sm font-bold text-slate-700">{data.kwhShifted} kWh</span>
                </div>
              </div>

              {/* Without optimization */}
              <div className="px-3 py-2.5 bg-rose-50 rounded-xl border border-rose-100">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-xs font-medium text-rose-700">Without optimization</span>
                  </div>
                  <span className="text-sm font-bold text-rose-700">{data.withoutOptimizationKg} kg CO₂</span>
                </div>
                <p className="text-[10px] text-rose-500 mt-1 pl-6">
                  {data.kwhShifted} kWh × 0.90 kg/kWh (peak emission)
                </p>
              </div>

              {/* With optimization */}
              <div className="px-3 py-2.5 bg-emerald-50 rounded-xl border border-emerald-100">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-700">With optimization</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-700">{data.withOptimizationKg} kg CO₂</span>
                </div>
                <p className="text-[10px] text-emerald-500 mt-1 pl-6">
                  {data.kwhShifted} kWh × 0.75 kg/kWh (off-peak emission)
                </p>
              </div>

              {/* CO₂ Avoided result */}
              <div className="px-3 py-3 bg-sky-50 rounded-xl border border-sky-200">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-sky-700">CO₂ Avoided</span>
                  <span className="text-base font-extrabold text-sky-700">{data.co2AvoidedKg} kg</span>
                </div>
                <p className="text-[10px] text-sky-500 mt-0.5">
                  Saved ₹{data.monthSavings} by shifting {data.kwhShifted} kWh from peak to off-peak
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Zap className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400 font-medium">No load shifting data yet</p>
              <p className="text-[11px] text-slate-300 mt-1">Start using the Optimizer to shift peak usage</p>
            </div>
          )}
        </div>



      </div>
    </div>
  );
};

export default Rewards;
