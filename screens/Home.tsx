
import React from 'react';
import LiquidGauge from '../components/LiquidGauge';
import ApplianceCard from '../components/ApplianceCard';
import { MOCK_APPLIANCES } from '../constants';
import { Zap, DollarSign, AlertTriangle, ArrowRight, MoreHorizontal, BarChart, ChevronRight, FileText } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tab } from '../types';
import { useApp } from '../contexts/AppContext';
import { getDashboardStats, DashboardStats } from '../services/api';
import { useApi } from '../hooks/useApi';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface HomeProps {
    onNavigate: (tab: Tab) => void;
    viewMode?: ViewMode;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Greeting based on time of day */
function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 17) return 'Good Afternoon,';
    return 'Good Evening,';
}

/** Initials from full name (e.g. "Suman Patra" → "SP") */
function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

/** Balance health label + color theme */
function getBalanceStatus(balance: number, lastRecharge: number) {
    if (lastRecharge <= 0) return { label: 'No Data', theme: 'slate' as const };
    const pct = (balance / lastRecharge) * 100;
    if (pct >= 60) return { label: 'Healthy', theme: 'emerald' as const };
    if (pct >= 30) return { label: 'Moderate', theme: 'amber' as const };
    return { label: 'Low Balance', theme: 'rose' as const };
}

const themeColors = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100' },
    slate: { bg: 'bg-slate-50', text: 'text-slate-400', border: 'border-slate-200' },
};

// ── Component ──────────────────────────────────────────────────────

const Home: React.FC<HomeProps> = ({ onNavigate, viewMode = 'mobile' }) => {
    const isWeb = viewMode === 'web';
    const isTablet = viewMode === 'tablet';
    const isCompact = isWeb || isTablet;

    // Real data from AppContext
    const { profile, home } = useApp();
    const userName = profile?.name || 'User';
    const initials = getInitials(userName);

    // Dashboard stats from RPC (single call)
    const { data: stats, loading: statsLoading } = useApi(
        () => getDashboardStats(home?.id || ''),
        [home?.id]
    );
    const s: DashboardStats = stats || {
        balance: 0, lastRechargeAmount: 0, lastRechargeDate: '—', balancePercent: 0,
        dailyAvgUsage: 0, currentTariff: 0, yearAverage: 0, currentLoad: 0,
        todayCost: 0, todayKwh: 0, monthBill: 0, monthSavings: 0, activeDevices: 0,
        currentSlotType: 'normal', currentSlotRate: 0,
        nextSlotChange: '—', nextSlotType: 'normal', nextSlotRate: 0,
    };

    // Derive balance health
    const { label: balanceLabel, theme: balanceTheme } = getBalanceStatus(s.balance, s.lastRechargeAmount);
    const colors = themeColors[balanceTheme];
    const balancePercent = s.lastRechargeAmount > 0 ? (s.balance / s.lastRechargeAmount) * 100 : 0;

    // Current tariff: prefer ToD slot rate, fallback to base tariff
    const currentTariff = s.currentSlotRate || s.currentTariff || 0;

    return (
        <div className={`pt-6 pb-32 overflow-y-auto h-full no-scrollbar relative ${isWeb ? 'px-8' : 'px-5'}`}>
            {/* Header */}
            <header className="flex justify-between items-center mb-4">
                <div>
                    <h1 className={`text-slate-500 font-medium ${isCompact ? 'text-xs' : 'text-sm'}`}>{getGreeting()}</h1>
                    <h2 className={`font-bold text-slate-800 tracking-tight ${isCompact ? 'text-xl' : 'text-2xl'}`}>{userName}</h2>
                </div>
                <button
                    onClick={() => onNavigate('Profile')}
                    className={`rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-800 font-bold hover:shadow-md transition-shadow ${isCompact ? 'w-10 h-10 text-sm' : 'w-12 h-12'}`}
                >
                    {initials}
                </button>
            </header>

            {/* BENTO GRID LAYOUT */}
            <div className={`grid gap-3 mb-6 ${isWeb ? 'grid-cols-4' : isTablet ? 'grid-cols-4' : 'grid-cols-2'}`}>

                {/* Left Column: Hero Liquid Gauge (Full Height) */}
                <motion.div
                    initial={isCompact ? false : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white shadow-soft border border-slate-100 relative overflow-hidden flex flex-col items-center justify-center col-span-2 rounded-[2rem] p-4 ${isWeb || isTablet ? 'min-h-[450px] h-full' : 'p-6 min-h-[450px]'}`}
                >
                    {/* Background Decoration */}
                    <div className={`absolute top-0 right-0 ${colors.bg} rounded-bl-[4rem] -z-0 ${isCompact ? 'w-20 h-20' : 'w-32 h-32'}`}></div>

                    <div className={`flex justify-between w-full items-start absolute px-4 z-10 ${isCompact ? 'top-3' : 'top-6 px-6'}`}>
                        <span className={`rounded-full font-bold uppercase tracking-wider border ${isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'} ${colors.bg} ${colors.text} ${colors.border}`}>
                            {statsLoading ? '...' : balanceLabel}
                        </span>
                        <MoreHorizontal className={`text-slate-300 ${isCompact ? 'w-4 h-4' : ''}`} />
                    </div>

                    <LiquidGauge
                        balancePercent={balancePercent}
                        balanceAmount={s.balance}
                        label={s.lastRechargeAmount > 0 ? `Recharged ₹${s.lastRechargeAmount}` : 'No recharge yet'}
                        subLabel={s.lastRechargeDate !== '—' ? `Recharged on ${s.lastRechargeDate}` : ''}
                        compact={isCompact}
                    />

                    {/* Stats Footer — ToD-aware tariff */}
                    <div className={`w-full flex justify-between items-center px-4 relative z-10 ${isCompact ? 'mt-4' : 'mt-10'}`}>
                        <div className="text-center">
                            <p className={`text-slate-400 font-medium uppercase tracking-wide ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                                Current Tariff
                                {s.currentSlotType !== 'normal' && (
                                    <span className={`ml-1 ${s.currentSlotType === 'peak' ? 'text-rose-400' : 'text-emerald-400'}`}>
                                        ({s.currentSlotType})
                                    </span>
                                )}
                            </p>
                            <p className={`text-slate-800 font-bold ${isCompact ? 'text-base' : 'text-xl'}`}>₹{currentTariff.toFixed(2)}/kWh</p>
                        </div>
                        <div className={`bg-slate-100 ${isCompact ? 'h-8 w-[1px]' : 'h-10 w-[1px]'}`}></div>
                        <div className="text-center">
                            <p className={`text-slate-400 font-medium uppercase tracking-wide ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Today's Usage</p>
                            <div className="flex flex-col">
                                <span className={`text-slate-800 font-bold leading-none ${isCompact ? 'text-base' : 'text-xl'}`}>₹{s.todayCost.toFixed(2)}</span>
                                <span className={`text-slate-400 font-bold mt-1 ${isCompact ? 'text-[9px]' : 'text-xs'}`}>{s.todayKwh} kWh</span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons: Recharge + View Bill */}
                    <div className={`w-full flex gap-3 z-20 ${isCompact ? 'mt-3' : 'mt-6'}`}>
                        <button className={`flex-1 bg-slate-900 text-white font-bold rounded-xl shadow-lg shadow-slate-200 active:scale-95 transition-transform flex items-center justify-center gap-2 ${isCompact ? 'py-2 text-xs' : 'py-3 text-base'}`}>
                            <Zap className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} fill="currentColor" />
                            Recharge
                        </button>
                        <button className={`flex-1 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl active:scale-95 transition-transform flex items-center justify-center gap-2 hover:bg-slate-50 ${isCompact ? 'py-2 text-xs' : 'py-3 text-base'}`}>
                            <FileText className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} />
                            View Bill
                        </button>
                    </div>
                </motion.div>

                {/* Right Column: Stats Stack Wrapper */}
                <div className="col-span-2 flex flex-col gap-3">
                    {/* Row 1: Forecast & Savings */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Item 2: Quick Stat - Forecast */}
                        <motion.div
                            initial={isCompact ? false : { opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: isCompact ? 0 : 0.1 }}
                            whileHover={isCompact ? {} : { scale: 1.02 }}
                            className={`bg-white shadow-soft border border-slate-100 flex flex-col justify-between rounded-[2rem] p-4 ${isCompact ? 'rounded-xl p-3 h-28' : 'h-40'}`}
                        >
                            <div className={`rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl mb-2'}`}>
                                <Zap className={`fill-current ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                            </div>
                            <div>
                                <p className={`text-slate-500 font-medium mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Month Forecast</p>
                                <div className="flex items-end gap-1">
                                    <span className={`font-bold text-slate-800 ${isCompact ? 'text-base' : 'text-xl'}`}>₹{s.monthBill}</span>
                                </div>
                                <div className={`w-full bg-slate-100 rounded-full mt-2 overflow-hidden ${isCompact ? 'h-1' : 'h-1.5'}`}>
                                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min((s.monthBill / (s.dailyAvgUsage * 30 || 1)) * 100, 100)}%` }}></div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Item 3: Quick Stat - Savings */}
                        <motion.div
                            initial={isCompact ? false : { opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: isCompact ? 0 : 0.2 }}
                            whileHover={isCompact ? {} : { scale: 1.02 }}
                            className={`bg-slate-900 shadow-soft text-white relative overflow-hidden flex flex-col justify-between rounded-[2rem] p-4 ${isCompact ? 'rounded-xl p-3 h-28' : 'h-40'}`}
                        >
                            <div className={`absolute right-0 top-0 bg-white/10 rounded-bl-full ${isCompact ? 'w-14 h-14' : 'w-20 h-20'}`}></div>
                            <div className={`rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 backdrop-blur-sm ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl mb-2'}`}>
                                <DollarSign className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                            </div>
                            <div>
                                <p className={`text-slate-300 font-medium mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Total Savings</p>
                                <div className="flex items-end gap-1">
                                    <span className={`font-bold ${isCompact ? 'text-base' : 'text-xl'}`}>₹{s.monthSavings}</span>
                                    <span className={`text-emerald-400 mb-0.5 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>+12%</span>
                                </div>
                                <p className={`text-slate-400 mt-0.5 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>vs last month</p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Item 4: Wide Banner - Alert / ToD Slot Info */}
                    <motion.div
                        initial={isCompact ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: isCompact ? 0 : 0.3 }}
                        whileHover={isCompact ? {} : { scale: 1.01 }}
                        className={`${s.currentSlotType === 'peak' ? 'bg-rose-50 border-rose-100' : s.currentSlotType === 'off-peak' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'} border flex items-center justify-between rounded-[2rem] p-4 ${isCompact ? 'rounded-xl p-3' : 'p-5'}`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`rounded-full bg-white flex items-center justify-center shadow-sm ${s.currentSlotType === 'peak' ? 'text-rose-500' : s.currentSlotType === 'off-peak' ? 'text-emerald-500' : 'text-amber-500'} ${isCompact ? 'w-9 h-9' : 'w-12 h-12 animate-pulse-slow'}`}>
                                <AlertTriangle className={isCompact ? 'w-4 h-4' : 'w-6 h-6'} />
                            </div>
                            <div>
                                <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : ''}`}>
                                    {s.currentSlotType === 'peak' ? 'Peak Hours Active' : s.currentSlotType === 'off-peak' ? 'Off-Peak — Save Now!' : 'Normal Tariff Hours'}
                                </h3>
                                <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                                    Next: {s.nextSlotType} at {s.nextSlotChange} (₹{s.nextSlotRate.toFixed(2)}/kWh)
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => onNavigate('Optimizer')}
                            className={`${s.currentSlotType === 'peak' ? 'bg-rose-500' : s.currentSlotType === 'off-peak' ? 'bg-emerald-500' : 'bg-amber-500'} text-white font-bold shadow-lg hover:scale-105 transition-transform ${isCompact ? 'px-3 py-1.5 rounded-lg text-[10px]' : 'px-4 py-2 rounded-xl text-xs'}`}
                        >
                            {s.currentSlotType === 'peak' ? 'Optimize' : 'Schedule'}
                        </button>
                    </motion.div>

                    {/* Item 5: Average Usage This Year */}
                    <motion.div
                        initial={isCompact ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: isCompact ? 0 : 0.4 }}
                        className={`bg-white shadow-soft border border-slate-100 flex flex-col justify-between rounded-[2rem] p-4 ${isCompact ? 'rounded-xl p-3 h-24' : 'p-5 h-32'}`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className={`rounded-full bg-amber-50 flex items-center justify-center text-amber-500 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}>
                                    <BarChart className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                                </div>
                                <div>
                                    <h3 className={`font-medium text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Average Usage This Year</h3>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`font-bold text-slate-800 ${isCompact ? 'text-lg' : 'text-2xl'}`}>₹{(s.yearAverage || s.monthBill).toLocaleString()}</span>
                                        <span className={`text-emerald-500 font-medium ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>-5% vs last year</span>
                                    </div>
                                </div>
                            </div>
                            <button className="bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-full p-2 transition-colors">
                                <ChevronRight className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                            </button>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-2">
                            <div className="bg-amber-400 w-[65%] h-full rounded-full"></div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Live Appliances Feed - Grid Layout */}
            <section>
                <div className="flex justify-between items-center mb-3 px-1">
                    <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-base' : 'text-lg'}`}>My Devices</h3>
                    <button
                        onClick={() => onNavigate('Control')}
                        className={`font-bold text-cyan-600 flex items-center gap-1 bg-cyan-50 rounded-full hover:bg-cyan-100 transition-colors ${isCompact ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}`}
                    >
                        View All <ArrowRight className={isCompact ? 'w-2 h-2' : 'w-3 h-3'} />
                    </button>
                </div>

                <div className={`grid gap-3 ${isWeb ? 'grid-cols-4' : isTablet ? 'grid-cols-4' : 'grid-cols-2'}`}>
                    {MOCK_APPLIANCES.map((appliance, idx) => (
                        <motion.div
                            key={appliance.id}
                            initial={isCompact ? false : { opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: isCompact ? 0 : 0.1 * idx }}
                        >
                            <ApplianceCard data={appliance} compact={isCompact} />
                        </motion.div>
                    ))}
                </div>
            </section>

        </div>
    );
};

export default Home;
