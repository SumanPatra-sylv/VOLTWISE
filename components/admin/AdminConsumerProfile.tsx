import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, AlertTriangle, Zap, IndianRupee, Clock, Shield, Package, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchConsumerProfile, fetchRiskScore } from '../../services/adminApi';
import type { ConsumerProfile, RiskScore } from '../../services/adminApi';

interface Props {
    userId: string;
    onClose: () => void;
}

const AdminConsumerProfile: React.FC<Props> = ({ userId, onClose }) => {
    const [data, setData] = useState<ConsumerProfile | null>(null);
    const [risk, setRisk] = useState<RiskScore | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('overview');

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [profile, riskData] = await Promise.all([
                    fetchConsumerProfile(userId),
                    fetchRiskScore(userId).catch(() => null),
                ]);
                setData(profile);
                setRisk(riskData);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        load();
    }, [userId]);

    const balanceColor = (b: number) => b < 50 ? 'text-rose-600' : b < 200 ? 'text-amber-600' : 'text-emerald-600';
    const balanceBg = (b: number) => b < 50 ? 'bg-rose-50' : b < 200 ? 'bg-amber-50' : 'bg-emerald-50';

    const tabs = ['overview', 'meter', 'appliances', 'recharges', 'activity'];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">

                {loading ? (
                    <div className="flex-1 flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                    </div>
                ) : !data?.profile ? (
                    <div className="flex-1 flex items-center justify-center py-20 text-slate-400">Consumer not found</div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex items-start justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-xl font-bold text-white">
                                    {(data.profile.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-800">{data.profile.name}</h2>
                                    <p className="text-xs text-slate-400">{data.profile.consumer_number || data.profile.phone || data.profile.email}</p>
                                    {risk && risk.risk_score > 0 && (
                                        <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${risk.risk_score > 50 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                                            <AlertTriangle className="w-3 h-3" /> Risk: {risk.risk_score}/100
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-400" /></button>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-slate-50/50">
                            <QuickStat icon={IndianRupee} label="Balance" value={`₹${(data.meter?.balance_amount ?? 0).toFixed(0)}`}
                                color={balanceColor(data.meter?.balance_amount ?? 0)} bg={balanceBg(data.meter?.balance_amount ?? 0)} />
                            <QuickStat icon={Clock} label="Last Recharge" value={data.meter?.last_recharge_date ? timeAgo(data.meter.last_recharge_date) : '—'} color="text-slate-600" bg="bg-slate-100" />
                            <QuickStat icon={Zap} label="Month Usage" value={`${((data.usage_30d || []).reduce((s: number, d: any) => s + (d.total_kwh || 0), 0)).toFixed(0)} kWh`} color="text-cyan-600" bg="bg-cyan-50" />
                            <QuickStat icon={AlertTriangle} label="Open Complaints" value={(data.open_complaints || []).length} color="text-amber-600" bg="bg-amber-50" />
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-1 px-5 pt-3 border-b border-slate-100">
                            {tabs.map(t => (
                                <button key={t} onClick={() => setTab(t)}
                                    className={`px-3 py-2 text-xs font-medium capitalize rounded-t-lg transition-colors ${tab === t ? 'bg-white text-slate-800 border-b-2 border-cyan-500' : 'text-slate-400 hover:text-slate-600'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            {tab === 'overview' && <OverviewTab data={data} risk={risk} />}
                            {tab === 'meter' && <MeterTab data={data} />}
                            {tab === 'appliances' && <AppliancesTab data={data} />}
                            {tab === 'recharges' && <RechargesTab data={data} />}
                            {tab === 'activity' && <ActivityTab data={data} />}
                        </div>

                        {/* Risk Flags */}
                        {risk && risk.flags.length > 0 && (
                            <div className="px-5 py-3 border-t border-slate-100 bg-rose-50/30">
                                <div className="flex flex-wrap gap-2">
                                    {risk.flags.map((f, i) => (
                                        <span key={i} className={`text-[10px] px-2 py-1 rounded-full font-medium ${f.severity === 'critical' ? 'bg-rose-100 text-rose-700' : f.severity === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                            {f.label}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </motion.div>
        </motion.div>
    );
};

// ── Sub-components ──────────

const QuickStat: React.FC<{ icon: any; label: string; value: any; color: string; bg: string }> = ({ icon: Icon, label, value, color, bg }) => (
    <div className={`${bg} rounded-xl p-3`}>
        <Icon className={`w-4 h-4 ${color} mb-1`} />
        <p className={`text-lg font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-slate-400">{label}</p>
    </div>
);

const OverviewTab: React.FC<{ data: ConsumerProfile; risk: RiskScore | null }> = ({ data }) => (
    <div className="grid grid-cols-2 gap-4">
        <InfoCard title="Profile" rows={[
            ['Name', data.profile?.name], ['Phone', data.profile?.phone], ['Consumer #', data.profile?.consumer_number],
            ['Household', `${data.profile?.household_members || '—'} members`], ['Joined', data.profile?.created_at ? new Date(data.profile.created_at).toLocaleDateString('en-IN') : '—'],
        ]} />
        <InfoCard title="Home & Tariff" rows={[
            ['Home', data.home?.name], ['Area', `${data.home?.area || '—'}, ${data.home?.city || ''}`],
            ['Tariff', data.tariff?.name], ['DISCOM', data.tariff?.discom_name],
            ['Load', `${data.home?.sanctioned_load_kw || '—'} kW`], ['Autopilot', data.home?.autopilot_enabled ? '✅ ON' : '❌ OFF'],
        ]} />
        <InfoCard title="Recharge Stats" rows={[
            ['Total Count', data.recharge_stats?.total_count], ['Total Amount', `₹${(data.recharge_stats?.total_amount || 0).toLocaleString('en-IN')}`],
            ['Avg Recharge', `₹${(data.recharge_stats?.avg_amount || 0).toFixed(0)}`],
            ['First Recharge', data.recharge_stats?.first_recharge_at ? new Date(data.recharge_stats.first_recharge_at).toLocaleDateString('en-IN') : '—'],
        ]} />
        <InfoCard title="Meter" rows={[
            ['Number', data.meter?.meter_number], ['Type', data.meter?.meter_type], ['Manufacturer', data.meter?.manufacturer],
            ['Balance', `₹${(data.meter?.balance_amount || 0).toFixed(0)}`], ['Active', data.meter?.is_active ? 'Yes' : 'No'],
        ]} />
    </div>
);

const MeterTab: React.FC<{ data: ConsumerProfile }> = ({ data }) => {
    const usage = (data.usage_30d || []).slice().reverse().slice(0, 30);
    return (
        <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">30-Day Usage</h3>
                {usage.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={usage}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(5)} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                            <Bar dataKey="total_kwh" fill="#06b6d4" radius={[4, 4, 0, 0]} name="kWh" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-xs text-slate-400 text-center py-8">No usage data</p>}
            </div>
        </div>
    );
};

const AppliancesTab: React.FC<{ data: ConsumerProfile }> = ({ data }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(data.appliances || []).map((a: any, i: number) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3 flex items-center gap-3">
                <Package className="w-5 h-5 text-slate-400" />
                <div>
                    <p className="text-xs font-medium text-slate-700">{a.name}</p>
                    <p className="text-[10px] text-slate-400">{a.rated_power_w}W · {a.status}</p>
                </div>
            </div>
        ))}
        {(!data.appliances || data.appliances.length === 0) && <p className="col-span-3 text-xs text-slate-400 text-center py-8">No appliances linked</p>}
    </div>
);

const RechargesTab: React.FC<{ data: ConsumerProfile }> = ({ data }) => (
    <div className="space-y-2">
        {(data.recent_recharges || []).map((r: any, i: number) => (
            <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                <div>
                    <p className="text-sm font-medium text-slate-700">₹{r.amount}</p>
                    <p className="text-[10px] text-slate-400">{r.method} · {r.units_credited?.toFixed(1)} units</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-slate-500">{new Date(r.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                    <p className="text-[10px] text-slate-300">Bal: ₹{(r.balance_after ?? 0).toFixed(0)}</p>
                </div>
            </div>
        ))}
        {(!data.recent_recharges || data.recent_recharges.length === 0) && <p className="text-xs text-slate-400 text-center py-8">No recharges</p>}
    </div>
);

const ActivityTab: React.FC<{ data: ConsumerProfile }> = ({ data }) => {
    const monthly = (data.monthly_usage || []).slice().reverse();
    return (
        <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">6-Month Consumption</h3>
                {monthly.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={monthly}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="month" tick={{ fontSize: 9 }} tickFormatter={(d: string) => d.slice(0, 7)} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                            <Bar dataKey="kwh" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="kWh" />
                        </BarChart>
                    </ResponsiveContainer>
                ) : <p className="text-xs text-slate-400 text-center py-8">No data</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400">Autopilot</p>
                    <p className="text-sm font-medium text-slate-700">{data.home?.autopilot_enabled ? `ON (${data.home.autopilot_strategy})` : 'OFF'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[10px] text-slate-400">Grid Protection</p>
                    <p className="text-sm font-medium text-slate-700">{data.home?.grid_protection_enabled ? 'Enabled' : 'Disabled'}</p>
                </div>
            </div>
        </div>
    );
};

const InfoCard: React.FC<{ title: string; rows: [string, any][] }> = ({ title, rows }) => (
    <div className="bg-slate-50 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
        <div className="space-y-2">
            {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                    <span className="text-slate-400">{k}</span>
                    <span className="text-slate-700 font-medium text-right">{v || '—'}</span>
                </div>
            ))}
        </div>
    </div>
);

function timeAgo(dateStr: string): string {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

export default AdminConsumerProfile;
