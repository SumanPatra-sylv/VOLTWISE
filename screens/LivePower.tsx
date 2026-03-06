import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { ACTIVE_DEVICES_PREVIEW } from '../constants';
import {
    ChevronRight, Zap, DollarSign, TrendingUp, TrendingDown, Clock,
    Wind, Thermometer, Box, Tv, Loader2, Activity, Plug, Brain,
    Radio, X, RefreshCw, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getDashboardStats, DashboardStats } from '../services/api';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';
import {
    getPowerSnapshot, getPowerBreakdown, getPowerTimeline,
    PowerSnapshot, PowerBreakdown, PowerTimelinePoint,
} from '../services/backend';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface LivePowerProps {
    viewMode?: ViewMode;
}

// ── Colors ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
    ac: '#06b6d4',
    geyser: '#f59e0b',
    refrigerator: '#10b981',
    washing_machine: '#8b5cf6',
    fan: '#3b82f6',
    tv: '#ef4444',
    lighting: '#f97316',
    other: '#6b7280',
};

const SOURCE_CONFIG = {
    smart_plug: { icon: Plug, label: 'Smart Plug', color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200' },
    nilm: { icon: Brain, label: 'NILM AI', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    estimated: { icon: Zap, label: 'Estimated', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
};

// ── Main Component ────────────────────────────────────────────────

const LivePower: React.FC<LivePowerProps> = ({ viewMode = 'mobile' }) => {
    const isCompact = viewMode === 'web' || viewMode === 'tablet';
    const { home } = useApp();

    // ── Original Insights state ───────────────────────────────────
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [donutData, setDonutData] = useState<{ name: string; value: number; fill: string }[]>([]);
    const [trendData, setTrendData] = useState<{ day: string; kwh: number }[]>([]);
    const [sparkline, setSparkline] = useState<{ value: number }[]>([]);
    const [totalKwh, setTotalKwh] = useState(0);

    // ── Live feed modal state ─────────────────────────────────────
    const [showLiveFeed, setShowLiveFeed] = useState(false);

    // ── Fetch original insights data (once, no polling) ───────────
    const fetchInsightsData = useCallback(async () => {
        if (!home?.id) return;
        setLoading(true);
        try {
            // Run ALL queries in parallel instead of sequentially
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

            const [statsResult, appliancesResult, dailyResult] = await Promise.all([
                getDashboardStats(home.id),
                supabase
                    .from('appliances')
                    .select('category, rated_power_w, status')
                    .eq('home_id', home.id)
                    .eq('is_active', true),
                supabase
                    .from('daily_aggregates')
                    .select('date, total_kwh')
                    .eq('home_id', home.id)
                    .is('appliance_id', null)
                    .gte('date', twoWeeksAgo.toISOString().split('T')[0])
                    .order('date', { ascending: true }),
            ]);

            setStats(statsResult);

            const appliances = appliancesResult.data;
            if (appliances && appliances.length > 0) {
                // Typical daily usage hours per category (for monthly kWh estimate)
                const DAILY_HOURS: Record<string, number> = {
                    ac: 8, refrigerator: 24, washing_machine: 1,
                    fan: 6, tv: 5, lighting: 5, geyser: 0.5, other: 2,
                };
                // Baseline 20W equivalent kWh/month added per appliance for demo realism
                const BASELINE_KWH_MONTH = (20 / 1000) * 24 * 30; // ~14.4 kWh

                const categoryKwh: Record<string, number> = {};
                for (const a of appliances) {
                    const dailyHours = DAILY_HOURS[a.category] ?? 2;
                    const ratedKw = (a.rated_power_w || 100) / 1000;
                    // Monthly kWh = rated(kW) × hours/day × 30 + baseline
                    const monthlyKwh = ratedKw * dailyHours * 30 + BASELINE_KWH_MONTH;
                    categoryKwh[a.category] = (categoryKwh[a.category] || 0) + monthlyKwh;
                }

                const totalKwhAll = Object.values(categoryKwh).reduce((s, v) => s + v, 0);
                const donut = Object.entries(categoryKwh).map(([cat, kwh]) => ({
                    name: cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                    value: Math.round(kwh),   // kWh for Recharts slice size
                    pct: totalKwhAll > 0 ? Math.round((kwh / totalKwhAll) * 100) : 0,
                    fill: CATEGORY_COLORS[cat] || '#6b7280',
                })).sort((a, b) => b.value - a.value);
                setDonutData(donut);
            }

            const dailyRows = dailyResult.data;
            if (dailyRows && dailyRows.length > 0) {
                setTrendData(dailyRows.map(r => ({
                    day: new Date(r.date).toLocaleDateString('en-US', { weekday: 'short' }),
                    kwh: Math.round(Number(r.total_kwh || 0) * 10) / 10,
                })));
                setTotalKwh(Math.round(dailyRows.reduce((s, r) => s + Number(r.total_kwh || 0), 0)));
            }
        } catch (err) {
            console.error('[LivePower] Failed to fetch insights:', err);
        } finally {
            setLoading(false);
        }
    }, [home?.id]);

    useEffect(() => { fetchInsightsData(); }, [fetchInsightsData]);

    const s = stats || {
        balance: 0, lastRechargeAmount: 0, lastRechargeDate: '—', balancePercent: 0,
        dailyAvgUsage: 0, currentTariff: 0, yearAverage: 0, currentLoad: 0,
        todayCost: 0, todayKwh: 0, monthBill: 0, monthSavings: 0, activeDevices: 0,
        currentSlotType: 'normal' as const, currentSlotRate: 0,
        nextSlotChange: '—', nextSlotType: 'normal' as const, nextSlotRate: 0,
    };

    const getDeviceIcon = (iconName: string) => {
        switch (iconName) {
            case 'wind': return <Wind className="w-4 h-4" />;
            case 'thermometer': return <Thermometer className="w-4 h-4" />;
            case 'box': return <Box className="w-4 h-4" />;
            case 'tv': return <Tv className="w-4 h-4" />;
            default: return <Zap className="w-4 h-4" />;
        }
    };

    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    if (loading) {
        return (
            <div className="pt-10 pb-32 px-5 overflow-y-auto h-full no-scrollbar flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <>
            <div className="pt-10 pb-32 px-5 overflow-y-auto h-full no-scrollbar">

                {/* ── Header ───────────────────────────────────────── */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">Analytics</h2>
                    <div className="flex items-center gap-2">
                        {/* Live Feed Button */}
                        <button
                            onClick={() => setShowLiveFeed(true)}
                            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-indigo-500 text-white px-4 py-2 rounded-full shadow-lg shadow-cyan-200/50 hover:shadow-cyan-300/60 active:scale-95 transition-all"
                        >
                            <Activity className="w-4 h-4" />
                            <span className="text-xs font-bold">Live Feed</span>
                            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        </button>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm">
                            <span className="text-xs font-bold text-slate-700">{currentMonth}</span>
                        </div>
                    </div>
                </div>

                {/* ── Consumption Donut Chart ───────────────────────── */}
                {donutData.length > 0 && (
                    <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-6 relative overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Consumption</h3>
                                <p className="text-xs text-slate-400 font-medium">Breakdown by appliance category</p>
                            </div>
                        </div>

                        <div className="h-64 relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={donutData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={70}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                        cornerRadius={6}
                                    >
                                        {donutData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-3xl font-bold text-slate-800">{totalKwh || Math.round(s.todayKwh * 30)}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">14-Day kWh</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                            {donutData.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }}></div>
                                    <span className="text-xs font-semibold text-slate-600 flex-1">{item.name}</span>
                                    <span className="text-xs font-bold text-slate-800">{(item as any).pct ?? item.value}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Daily Trends Chart ───────────────────────────── */}
                {trendData.length > 0 && (
                    <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-6">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Daily Trend</h3>
                                <p className="text-xs text-slate-400 font-medium">kWh usage — last 14 days</p>
                            </div>
                        </div>

                        <div className="h-48 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData}>
                                    <defs>
                                        <linearGradient id="colorKwh" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '12px', color: '#0f172a', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        itemStyle={{ color: '#0ea5e9', fontWeight: 'bold' }}
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    />
                                    <Area type="monotone" dataKey="kwh" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorKwh)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                {/* ── Tariff / Balance Banner ──────────────────────── */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-slate-100 rounded-[1.5rem] shadow-soft p-4 mb-6 flex flex-col gap-3"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500">
                                <Clock className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Balance Left</div>
                                <div className="text-slate-800 font-bold">₹{s.balance} <span className={s.balancePercent < 30 ? 'text-rose-500' : 'text-emerald-500'}>({s.balancePercent.toFixed(0)}%)</span></div>
                            </div>
                        </div>
                        <div className="h-8 w-[1px] bg-slate-100"></div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Daily Avg Usage</div>
                                <div className="text-slate-800 font-bold">₹{s.dailyAvgUsage.toFixed(0)}/day</div>
                            </div>
                        </div>
                    </div>
                    {s.dailyAvgUsage > 0 && (
                        <div className="bg-cyan-50 text-cyan-700 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border border-cyan-100">
                            <Zap className="w-3 h-3 fill-current" />
                            <span>Smart Tip: At ₹{s.dailyAvgUsage.toFixed(0)}/day, balance lasts ~{Math.floor(s.balance / Math.max(1, s.dailyAvgUsage))} days.</span>
                        </div>
                    )}
                </motion.div>

                {/* ── 2x2 Key Metrics ──────────────────────────────── */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    {/* Total Energy */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center"><Zap className="w-4 h-4 fill-current" /></div>
                                {s.todayKwh > 10 && <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100">High</span>}
                            </div>
                            <div className="text-xs text-slate-400 font-medium">Total Energy Today</div>
                            <div className="text-2xl font-bold text-slate-800 mb-1">{s.todayKwh} <span className="text-sm text-slate-400 font-normal">kWh</span></div>
                        </div>
                        <div className="h-8 -mx-4 -mb-4 bg-gradient-to-t from-cyan-100/60 to-transparent rounded-b-[2rem]" />
                    </motion.div>

                    {/* Est Bill */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center"><DollarSign className="w-4 h-4" /></div>
                                <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100">On Track</span>
                            </div>
                            <div className="text-xs text-slate-400 font-medium">Est. Monthly Bill</div>
                            <div className="text-2xl font-bold text-slate-800 mb-1">₹{s.monthBill}</div>
                        </div>
                        <div className="h-8 -mx-4 -mb-4 bg-gradient-to-t from-indigo-100/60 to-transparent rounded-b-[2rem]" />
                    </motion.div>

                    {/* Appliances ON */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><Zap className="w-4 h-4" /></div>
                            </div>
                            <div className="text-xs text-slate-400 font-medium">Appliances ON</div>
                            <div className="text-2xl font-bold text-slate-800 mb-1">{s.activeDevices} <span className="text-sm text-slate-400 font-normal">devices</span></div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                            {ACTIVE_DEVICES_PREVIEW.map((dev, idx) => (
                                <div key={idx} className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-white ${dev.bg} ${dev.color} -ml-1 first:ml-0 relative z-10`}>
                                    {getDeviceIcon(dev.icon)}
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Savings */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><DollarSign className="w-4 h-4" /></div>
                                {s.monthSavings > 0 && <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100">Saving</span>}
                            </div>
                            <div className="text-xs text-slate-400 font-medium">Month Savings</div>
                            <div className="text-2xl font-bold text-slate-800 mb-1">₹{s.monthSavings}</div>
                        </div>
                        <div className="h-8 -mx-4 -mb-4 bg-gradient-to-t from-emerald-100/60 to-transparent rounded-b-[2rem]" />
                    </motion.div>
                </div>

            </div>

            {/* ── Live Feed Modal ──────────────────────────────── */}
            <AnimatePresence>
                {showLiveFeed && (
                    <LiveFeedModal
                        homeId={home?.id || 'demo'}
                        viewMode={viewMode}
                        onClose={() => setShowLiveFeed(false)}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

// ── Live Feed Modal Component ─────────────────────────────────────

const LiveFeedModal: React.FC<{
    homeId: string;
    viewMode: ViewMode;
    onClose: () => void;
}> = ({ homeId, viewMode, onClose }) => {
    const isCompact = viewMode === 'web' || viewMode === 'tablet';
    const isWeb = viewMode === 'web';

    const [snapshot, setSnapshot] = useState<PowerSnapshot | null>(null);
    const [breakdown, setBreakdown] = useState<PowerBreakdown | null>(null);
    const [timeline, setTimeline] = useState<PowerTimelinePoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const pollRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch snapshot only (lightweight — for polling)
    const fetchSnapshot = useCallback(async () => {
        setRefreshing(true);
        try {
            const snap = await getPowerSnapshot(homeId);
            setSnapshot(snap);
        } catch (err) {
            console.error('[LiveFeed] Snapshot error:', err);
        } finally {
            setRefreshing(false);
        }
    }, [homeId]);

    // Fetch all data once on open (heavy — no polling)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [snap, bd, tl] = await Promise.all([
                    getPowerSnapshot(homeId),
                    getPowerBreakdown(homeId),
                    getPowerTimeline(homeId, 24),
                ]);
                if (!cancelled) {
                    setSnapshot(snap);
                    setBreakdown(bd);
                    setTimeline(tl.data || []);
                }
            } catch (err) {
                console.error('[LiveFeed] Initial fetch error:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [homeId]);

    // Poll only snapshot every 15 seconds (lightweight, cached on server)
    useEffect(() => {
        if (loading) return; // Don't start polling until initial load is done
        pollRef.current = setInterval(fetchSnapshot, 10000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchSnapshot, loading]);

    const aggregateW = snapshot?.aggregate_watts || 0;

    // Timeline chart data — 24 hourly points, pre-formatted by backend
    const chartData = timeline.map(p => ({
        time: (p as any).time_label || '',
        watts: p.watts,
    }));

    // Responsive classes based on viewMode
    const modalPositionClass = isWeb
        ? 'absolute bottom-4 left-1/2 -translate-x-1/2 w-[700px] rounded-[2rem]'
        : isCompact
            ? 'absolute bottom-2 left-1/2 -translate-x-1/2 w-[600px] rounded-[2rem]'
            : 'absolute bottom-0 left-0 right-0 rounded-t-[2rem]';

    const modalMaxH = isWeb ? 'max-h-[85vh]' : isCompact ? 'max-h-[85vh]' : 'max-h-[85vh]';
    const contentPx = isWeb ? 'px-8' : isCompact ? 'px-6' : 'px-4';
    const gridCols = isWeb ? 'grid-cols-3' : 'grid-cols-2';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className={`${modalPositionClass} ${modalMaxH} bg-slate-50 overflow-y-auto no-scrollbar`}
                onClick={e => e.stopPropagation()}
            >
                {/* Handle bar */}
                <div className={`sticky top-0 bg-slate-50 pt-3 pb-2 ${contentPx} z-10 rounded-t-[2rem]`}>
                    <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto mb-3" />
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-slate-800">Live Power Feed</h3>
                            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">Live</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => fetchSnapshot()}
                                disabled={refreshing}
                                className={`w-8 h-8 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 ${refreshing ? 'animate-spin' : ''}`}
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 rounded-full border border-slate-200 bg-white shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className={`${contentPx} pb-8`}>
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                        </div>
                    ) : (
                        <>
                            {/* ── Aggregate Power Hero ───────────────── */}
                            <div className="bg-white shadow-soft border border-slate-100 rounded-[2rem] p-6 mb-5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-50 rounded-bl-[4rem] -z-0" />
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center">
                                            <Activity className="w-5 h-5" />
                                        </div>
                                        <p className="text-xs text-slate-400 font-medium">Total Power Right Now</p>
                                    </div>
                                    <div className="flex items-baseline gap-2 mb-3">
                                        <span className="text-5xl font-extrabold text-slate-800 tracking-tight">
                                            {aggregateW.toLocaleString()}
                                        </span>
                                        <span className="text-lg text-slate-400 font-bold">W</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5 bg-cyan-50 border border-cyan-100 px-2 py-1 rounded-lg">
                                            <Plug className="w-3.5 h-3.5 text-cyan-600" />
                                            <span className="text-xs font-bold text-cyan-700">{snapshot?.smart_plug_count || 0} Smart Plug</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">
                                            <Brain className="w-3.5 h-3.5 text-indigo-600" />
                                            <span className="text-xs font-bold text-indigo-700">{snapshot?.nilm_count || 0} NILM AI</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Per-Appliance Cards ───────────────── */}
                            <div className="mb-5">
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <h4 className="font-bold text-slate-800">Appliance Breakdown</h4>
                                    <div className="flex items-center gap-1">
                                        <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                                        <span className="text-[10px] text-slate-400 font-medium">Updates every 10s</span>
                                    </div>
                                </div>
                                <div className={`grid gap-3 ${gridCols}`}>
                                    {(snapshot?.appliances || []).map((app) => {
                                        const srcCfg = SOURCE_CONFIG[app.source] || SOURCE_CONFIG.nilm;
                                        const color = CATEGORY_COLORS[app.category] || '#94a3b8';
                                        return (
                                            <div
                                                key={app.appliance}
                                                className={`bg-white border shadow-soft rounded-[1.5rem] p-4 ${app.is_on ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                                                        <Zap className="w-4 h-4" style={{ color }} />
                                                    </div>
                                                    <span className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold ${srcCfg.bg} ${srcCfg.color} border ${srcCfg.border}`}>
                                                        {app.source === 'smart_plug' ? '🔌 Exact' : app.source === 'estimated' ? '📊 Est.' : '🧠 NILM'}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-medium text-slate-500 truncate">{app.label}</p>
                                                <p className={`text-xl font-bold mt-1 ${app.is_on ? 'text-slate-800' : 'text-slate-400'}`}>
                                                    {app.is_on ? Math.round(app.estimated_watts) : 0}
                                                    <span className="text-[10px] font-medium text-slate-400 ml-1">W</span>
                                                </p>
                                                {app.source === 'nilm' && app.is_on && (
                                                    <p className="text-[9px] text-slate-400 mt-1">{(app.confidence * 100).toFixed(0)}% confidence</p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* ── Power Donut (Real-Time) ──────────── */}
                            {breakdown && breakdown.breakdown.length > 0 && (
                                <div className="bg-white shadow-soft border border-slate-100 rounded-[2rem] p-6 mb-5">
                                    <h4 className="font-bold text-slate-800 mb-1">Power Distribution</h4>
                                    <p className="text-xs text-slate-400 font-medium mb-4">Real-time consumption share</p>
                                    <div className="h-48 relative">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={breakdown.breakdown as any[]}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={4}
                                                    dataKey="watts"
                                                    stroke="none"
                                                    cornerRadius={6}
                                                >
                                                    {breakdown.breakdown.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.category] || '#94a3b8'} />
                                                    ))}
                                                </Pie>
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-2xl font-extrabold text-slate-800">{Math.round(breakdown.total_watts)}</span>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Watts</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        {breakdown.breakdown.map((item, idx) => {
                                            const srcCfg = SOURCE_CONFIG[item.source as keyof typeof SOURCE_CONFIG] || SOURCE_CONFIG.estimated;
                                            return (
                                                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl">
                                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[item.category] || '#94a3b8' }} />
                                                    <span className="text-[10px] font-semibold text-slate-600 flex-1 truncate">{item.label}</span>
                                                    <span className="text-[10px] font-bold text-slate-800">{item.watts}W</span>
                                                    <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${srcCfg.bg} ${srcCfg.color}`}>
                                                        {item.source === 'smart_plug' ? '🔌' : '🧠'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── 24h Timeline ─────────────────────── */}
                            {chartData.length > 0 && (
                                <div className="bg-white shadow-soft border border-slate-100 rounded-[2rem] p-6 mb-5">
                                    <h4 className="font-bold text-slate-800 mb-1">24h Power Trend</h4>
                                    <p className="text-xs text-slate-400 font-medium mb-4">Aggregate usage over time</p>
                                    <div className="h-44">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={chartData}>
                                                <defs>
                                                    <linearGradient id="colorLivePower" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                                                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="time" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} dy={10} interval={3} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#fff', borderColor: '#e2e8f0', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                                                    formatter={(value: number) => [`${value} W`, 'Power']}
                                                />
                                                <Area type="monotone" dataKey="watts" stroke="#06b6d4" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLivePower)" />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* ── NILM Info Bar ────────────────────── */}
                            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-4 mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                                        <Brain className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-indigo-800">NILM Powered by XGBoost</p>
                                        <p className="text-xs text-indigo-600/70">
                                            {snapshot?.nilm_count || 0} appliance(s) estimated using AI.
                                            Add smart plugs for exact readings.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default LivePower;
