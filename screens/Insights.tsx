
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, CartesianGrid } from 'recharts';
import { CHART_DATA_DONUT, CHART_DATA_TRENDS, SPARKLINE_DATA, DASHBOARD_STATS, ACTIVE_DEVICES_PREVIEW } from '../constants';
import { ChevronLeft, ChevronRight, Download, Filter, Zap, DollarSign, TrendingUp, Clock, Wind, Thermometer, Box, Tv, Lightbulb } from 'lucide-react';
import { motion } from 'framer-motion';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface InsightsProps {
    viewMode?: ViewMode;
}

const Insights: React.FC<InsightsProps> = ({ viewMode = 'mobile' }) => {
    const isCompact = viewMode === 'web' || viewMode === 'tablet';

    const getDeviceIcon = (iconName: string) => {
        switch (iconName) {
            case 'wind': return <Wind className="w-4 h-4" />;
            case 'thermometer': return <Thermometer className="w-4 h-4" />;
            case 'box': return <Box className="w-4 h-4" />;
            case 'tv': return <Tv className="w-4 h-4" />;
            default: return <Zap className="w-4 h-4" />;
        }
    };

    return (
        <div className="pt-10 pb-32 px-5 overflow-y-auto h-full no-scrollbar">

            {/* Date Selector */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-800">Analytics</h2>
                <div className="flex items-center gap-2 bg-white px-1 py-1 rounded-full border border-slate-200 shadow-sm">
                    <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-full transition-colors"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
                    <span className="text-xs font-bold text-slate-700 px-2">Dec 2025</span>
                    <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 rounded-full transition-colors"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
                </div>
            </div>

            {/* Donut Chart Section (Bento Card) */}
            <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-6 relative overflow-hidden">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Consumption</h3>
                        <p className="text-xs text-slate-400 font-medium">Breakdown by device</p>
                    </div>
                    <button className="p-2 bg-slate-50 rounded-xl text-slate-400"><Filter className="w-4 h-4" /></button>
                </div>

                <div className="h-64 relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={CHART_DATA_DONUT}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={90}
                                paddingAngle={5}
                                dataKey="value"
                                stroke="none"
                                cornerRadius={6}
                            >
                                {CHART_DATA_DONUT.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Center Label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-3xl font-bold text-slate-800">400</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">kWh Total</span>
                    </div>
                </div>

                {/* Legend */}
                <div className="grid grid-cols-2 gap-3 mt-2">
                    {CHART_DATA_DONUT.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }}></div>
                            <span className="text-xs font-semibold text-slate-600 flex-1">{item.name}</span>
                            <span className="text-xs font-bold text-slate-800">{item.value}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trends Chart (Bento Card) */}
            <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">Daily Trend</h3>
                        <p className="text-xs text-slate-400 font-medium">kWh usage over time</p>
                    </div>
                    <button className="p-2 bg-slate-50 rounded-xl text-slate-400"><Download className="w-4 h-4" /></button>
                </div>

                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={CHART_DATA_TRENDS}>
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

            {/* SMART TARIFF BANNER (Moved to Bottom) */}
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
                            <div className="text-slate-800 font-bold">₹{DASHBOARD_STATS.balance} <span className={DASHBOARD_STATS.balancePercent < 30 ? 'text-rose-500' : 'text-emerald-500'}>({DASHBOARD_STATS.balancePercent.toFixed(0)}%)</span></div>
                        </div>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-100"></div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Daily Avg Usage</div>
                            <div className="text-slate-800 font-bold">₹{DASHBOARD_STATS.dailyAvgUsage.toFixed(0)}/day</div>
                        </div>
                    </div>
                </div>
                <div className="bg-cyan-50 text-cyan-700 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border border-cyan-100">
                    <Zap className="w-3 h-3 fill-current" />
                    <span>Smart Tip: At ₹{DASHBOARD_STATS.dailyAvgUsage.toFixed(0)}/day, balance lasts ~{Math.floor(DASHBOARD_STATS.balance / DASHBOARD_STATS.dailyAvgUsage)} days.</span>
                </div>
            </motion.div>

            {/* 2x2 KEY METRICS GRID WITH PREMIUM AREA CHARTS */}
            <div className="grid grid-cols-2 gap-4 mb-8">

                {/* Card 1: Total Energy */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="w-8 h-8 rounded-xl bg-cyan-50 text-cyan-500 flex items-center justify-center"><Zap className="w-4 h-4 fill-current" /></div>
                            <span className="text-[10px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded-lg border border-rose-100">High</span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">Total Energy Today</div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{DASHBOARD_STATS.todayKwh} <span className="text-sm text-slate-400 font-normal">kWh</span></div>
                    </div>
                    {/* Premium Sparkline: Area with Gradient */}
                    <div className="h-12 -mx-4 -mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={SPARKLINE_DATA}>
                                <defs>
                                    <linearGradient id="colorCyan" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} fill="url(#colorCyan)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Card 2: Est Bill */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center"><DollarSign className="w-4 h-4" /></div>
                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100">On Track</span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">Est. Monthly Bill</div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">₹{DASHBOARD_STATS.monthBill}</div>
                    </div>
                    <div className="h-12 -mx-4 -mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={SPARKLINE_DATA}>
                                <defs>
                                    <linearGradient id="colorIndigo" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#colorIndigo)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Card 3: Appliances ON (Redesigned - Visual Icons) */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><Zap className="w-4 h-4" /></div>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">Appliances ON</div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">{DASHBOARD_STATS.activeDevices} <span className="text-sm text-slate-400 font-normal">devices</span></div>
                    </div>

                    {/* Visual Icon Stack representing active devices */}
                    <div className="flex items-center gap-2 mt-2">
                        {ACTIVE_DEVICES_PREVIEW.map((dev, idx) => (
                            <div key={idx} className={`w-8 h-8 rounded-full flex items-center justify-center shadow-sm border border-white ${dev.bg} ${dev.color} -ml-1 first:ml-0 relative z-10`}>
                                {getDeviceIcon(dev.icon)}
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Card 4: Savings */}
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="bg-white p-4 rounded-[2rem] shadow-soft border border-slate-100 relative overflow-hidden flex flex-col justify-between h-40">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><DollarSign className="w-4 h-4" /></div>
                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-lg border border-emerald-100">↗ 12%</span>
                        </div>
                        <div className="text-xs text-slate-400 font-medium">Projected Savings</div>
                        <div className="text-2xl font-bold text-slate-800 mb-1">₹{DASHBOARD_STATS.monthSavings}</div>
                    </div>
                    <div className="h-12 -mx-4 -mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={SPARKLINE_DATA}>
                                <defs>
                                    <linearGradient id="colorEmerald" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#colorEmerald)" dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </div>

        </div>
    );
};

export default Insights;
