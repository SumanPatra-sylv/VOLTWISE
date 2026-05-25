import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, LogOut, RefreshCw, Bot, LayoutDashboard, Users,
  IndianRupee, Activity, Loader2, BarChart3, Leaf, Package, MessageSquare, UserCheck,
  Shield, Settings, AlertTriangle, ChevronDown, ChevronRight, Plus, CheckCircle2,
  ArrowLeft, Clock, Send, ExternalLink, User
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { fetchDashboardStats, fetchConsumers, fetchRevenueStats, fetchMeterHealth, fetchConsumptionReport, fetchOptimizationReport, fetchApplianceReport, fetchComplaintStats, fetchAdoptionReport, fetchAuditLogs, fetchDiscoms, fetchOutages, createOutage, resolveOutage, fetchComplaintList, fetchComplaintDetail, updateComplaintStatus, addComplaintNote, impersonateConsumer } from '../services/adminApi';
import type { DashboardStats, ConsumerRow } from '../services/adminApi';
import AdminKpiCards from '../components/admin/AdminKpiCards';
import AdminConsumerTable from '../components/admin/AdminConsumerTable';
import AdminConsumerProfile from '../components/admin/AdminConsumerProfile';
import AdminChatbot from '../components/AdminChatbot';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

type AdminTab = 'dashboard' | 'consumers' | 'revenue' | 'meters' | 'load' | 'optimization' | 'appliances' | 'complaints' | 'adoption' | 'audit' | 'tariffs' | 'outages';

const TAB_CONFIG: { key: AdminTab; label: string; icon: any }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'consumers', label: 'Consumers', icon: Users },
  { key: 'revenue', label: 'Revenue', icon: IndianRupee },
  { key: 'load', label: 'Load', icon: BarChart3 },
  { key: 'optimization', label: 'Optimization', icon: Leaf },
  { key: 'appliances', label: 'Appliances', icon: Package },
  { key: 'meters', label: 'Meters', icon: Activity },
  { key: 'complaints', label: 'Complaints', icon: MessageSquare },
  { key: 'adoption', label: 'Adoption', icon: UserCheck },
  { key: 'tariffs', label: 'Tariffs', icon: Settings },
  { key: 'outages', label: 'Outages', icon: AlertTriangle },
  { key: 'audit', label: 'Audit', icon: Shield },
];

const AdminDashboard: React.FC = () => {
  const { signOut, profile, setViewAsConsumer } = useApp();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Data states
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [consumers, setConsumers] = useState<ConsumerRow[]>([]);
  const [revenueData, setRevenueData] = useState<any>(null);
  const [meterHealth, setMeterHealth] = useState<any>(null);
  const [consumptionData, setConsumptionData] = useState<any>(null);
  const [optimizationData, setOptimizationData] = useState<any>(null);
  const [applianceData, setApplianceData] = useState<any>(null);
  const [complaintData, setComplaintData] = useState<any>(null);
  const [adoptionData, setAdoptionData] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [tariffData, setTariffData] = useState<any>(null);
  const [outageData, setOutageData] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchDashboardStats(), fetchConsumers()]);
      setStats(s);
      setConsumers(c);
    } catch (e) {
      console.error('Dashboard load failed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Lazy-load tab data
  useEffect(() => {
    if (tab === 'revenue' && !revenueData) fetchRevenueStats().then(setRevenueData).catch(console.error);
    if (tab === 'meters' && !meterHealth) fetchMeterHealth().then(setMeterHealth).catch(console.error);
    if (tab === 'load' && !consumptionData) fetchConsumptionReport().then(setConsumptionData).catch(console.error);
    if (tab === 'optimization' && !optimizationData) fetchOptimizationReport().then(setOptimizationData).catch(console.error);
    if (tab === 'appliances' && !applianceData) fetchApplianceReport().then(setApplianceData).catch(console.error);
    if (tab === 'complaints' && !complaintData) fetchComplaintStats().then(setComplaintData).catch(console.error);
    if (tab === 'adoption' && !adoptionData) fetchAdoptionReport().then(setAdoptionData).catch(console.error);
    if (tab === 'audit' && !auditData) fetchAuditLogs().then(setAuditData).catch(console.error);
    if (tab === 'tariffs' && !tariffData) fetchDiscoms().then(setTariffData).catch(console.error);
    if (tab === 'outages' && !outageData) fetchOutages(false).then(setOutageData).catch(console.error);
  }, [tab, revenueData, meterHealth, consumptionData, optimizationData, applianceData, complaintData, adoptionData, auditData, tariffData, outageData]);

  const handleRefresh = () => {
    setRefreshing(true);
    setRevenueData(null); setMeterHealth(null); setConsumptionData(null);
    setOptimizationData(null); setApplianceData(null); setComplaintData(null); setAdoptionData(null);
    setAuditData(null); setTariffData(null); setOutageData(null);
    loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
          <p className="text-slate-400 font-medium text-sm">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Sidebar (Desktop) */}
      <aside className="w-64 bg-white border-r border-slate-100 hidden md:flex flex-col h-screen sticky top-0 z-40">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Zap className="w-5 h-5 text-white" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">VoltWise</h1>
            <p className="text-[10px] text-slate-400">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto no-scrollbar pb-6">
          {TAB_CONFIG.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${tab === t.key ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
              <t.icon className={`w-5 h-5 ${tab === t.key ? 'text-white' : 'text-slate-400'}`} />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2">
          <button onClick={() => setViewAsConsumer(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 transition-colors">
            <User className="w-4 h-4" /> Consumer View
          </button>
          <button onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
          <div className="mt-2 bg-slate-50 rounded-xl p-3 flex items-center gap-3 border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs uppercase">
              {profile?.name?.charAt(0) || 'A'}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-slate-800 truncate">{profile?.name || 'Admin'}</p>
              <p className="text-[10px] text-slate-500">Administrator</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-100 sticky top-0 z-40">
          <div className="flex justify-between items-center p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-md">
                <Zap className="w-4 h-4 text-white" fill="currentColor" />
              </div>
              <h1 className="font-bold text-slate-800">VoltWise Admin</h1>
            </div>
          </div>
          {/* Mobile tabs */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
            {TAB_CONFIG.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${tab === t.key ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100/80 text-slate-500 hover:bg-slate-200/50'}`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-slate-800 capitalize hidden md:block">
              {TAB_CONFIG.find(t => t.key === tab)?.label || 'Dashboard'}
            </h2>
            <div className="flex items-center gap-2 md:ml-auto">
              <button onClick={handleRefresh} disabled={refreshing}
                className="p-2.5 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-all shadow-sm">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {tab === 'dashboard' && stats && (
            <>
              <AdminKpiCards stats={stats} />
              <AdminConsumerTable consumers={consumers} onViewProfile={setSelectedUserId} />
          </>
        )}

        {tab === 'consumers' && (
          <AdminConsumerTable consumers={consumers} onViewProfile={setSelectedUserId} />
        )}

        {tab === 'revenue' && <RevenueTab data={revenueData} stats={stats} />}

        {tab === 'load' && <LoadTab data={consumptionData} />}

        {tab === 'optimization' && <OptimizationTab data={optimizationData} />}

        {tab === 'appliances' && <AppliancesTab data={applianceData} />}

        {tab === 'meters' && <MeterHealthTab data={meterHealth} stats={stats} />}

        {tab === 'complaints' && <ComplaintsTab data={complaintData} />}

        {tab === 'adoption' && <AdoptionTab data={adoptionData} />}

        {tab === 'tariffs' && <TariffTab data={tariffData} />}

        {tab === 'outages' && <OutageTab data={outageData} onRefresh={() => { setOutageData(null); fetchOutages(false).then(setOutageData); }} />}

        {tab === 'audit' && <AuditTab data={auditData} />}
      </main>

      {/* Consumer Profile Modal */}
      <AnimatePresence>
        {selectedUserId && (
          <AdminConsumerProfile userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
        )}
      </AnimatePresence>

      {/* AI Chatbot */}
      <AdminChatbot isOpen={chatOpen} onToggle={() => setChatOpen(false)} />
      {!chatOpen && (
        <button onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl shadow-lg shadow-indigo-500/30 hover:shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all z-50">
          <Bot className="w-6 h-6" />
        </button>
      )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// REVENUE TAB
// ═══════════════════════════════════════════════════════════════════

const COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];

const RevenueTab: React.FC<{ data: any; stats: DashboardStats | null }> = ({ data, stats }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;

  const daily = data.daily_breakdown || [];
  const byMethod = data.revenue_by_method || [];
  const topConsumers = data.top_10_consumers || [];

  return (
    <div className="space-y-4">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiMini label="Monthly Revenue" value={`₹${(stats?.monthly_revenue || 0).toLocaleString('en-IN')}`} color="text-cyan-600" bg="bg-cyan-50" />
        <KpiMini label="Today's Revenue" value={`₹${(stats?.today_revenue || 0).toLocaleString('en-IN')}`} color="text-teal-600" bg="bg-teal-50" />
        <KpiMini label="Avg Balance" value={`₹${(stats?.avg_balance || 0).toFixed(0)}`} color="text-amber-600" bg="bg-amber-50" />
        <KpiMini label="Active Rechargers" value={stats?.active_rechargers_7d || 0} color="text-violet-600" bg="bg-violet-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Revenue Chart */}
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Daily Revenue</h3>
          {daily.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 9 }} tickFormatter={(d: string) => String(d).slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v: any) => [`₹${v}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-300 text-center py-16">No revenue data for this period</p>}
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Payment Methods</h3>
          {byMethod.length > 0 ? (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={byMethod} dataKey="count" nameKey="method" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                    {byMethod.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {byMethod.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-slate-500 flex-1">{m.method}</span>
                    <span className="text-xs font-medium text-slate-700">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-slate-300 text-center py-16">No data</p>}
        </div>
      </div>

      {/* Top Consumers */}
      {topConsumers.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Top Recharging Consumers</h3>
          <div className="space-y-2">
            {topConsumers.slice(0, 10).map((c: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-bold text-slate-300">#{i + 1}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.min(100, ((c.total_recharged || 0) / (topConsumers[0]?.total_recharged || 1)) * 100)}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-24 text-right truncate">{c.name}</span>
                <span className="text-xs font-medium text-slate-700 w-20 text-right">₹{(c.total_recharged || 0).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// METER HEALTH TAB 
// ═══════════════════════════════════════════════════════════════════

const MeterHealthTab: React.FC<{ data: any; stats: DashboardStats | null }> = ({ data, stats }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;

  const totalMeters = data.total_meters || stats?.active_meters || 0;
  const onlineMeters = data.online_meters || (totalMeters - (stats?.offline_meters || 0));
  const offlineMeters = data.offline_meters || stats?.offline_meters || 0;
  const staleMeters = data.stale_meters || stats?.stale_meters || 0;
  const manufacturers = data.manufacturer_distribution || [];
  const offlineList = data.offline_meter_details || [];

  return (
    <div className="space-y-4">
      {/* Health KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiMini label="Total Meters" value={totalMeters} color="text-slate-600" bg="bg-slate-100" />
        <KpiMini label="Online" value={onlineMeters} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiMini label="Stale (6-24h)" value={staleMeters} color="text-amber-600" bg="bg-amber-50" />
        <KpiMini label="Offline (>24h)" value={offlineMeters} color="text-rose-600" bg="bg-rose-50" />
      </div>

      {/* Health Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Health Distribution</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={[
                  { name: 'Online', value: onlineMeters },
                  { name: 'Stale', value: staleMeters },
                  { name: 'Offline', value: offlineMeters },
                ]} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <LegendItem color="#10b981" label="Online" value={`${((onlineMeters / Math.max(totalMeters, 1)) * 100).toFixed(0)}%`} />
              <LegendItem color="#f59e0b" label="Stale" value={`${((staleMeters / Math.max(totalMeters, 1)) * 100).toFixed(0)}%`} />
              <LegendItem color="#ef4444" label="Offline" value={`${((offlineMeters / Math.max(totalMeters, 1)) * 100).toFixed(0)}%`} />
            </div>
          </div>
        </div>

        {/* Manufacturer Distribution */}
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Manufacturers</h3>
          {manufacturers.length > 0 ? (
            <div className="space-y-3">
              {manufacturers.map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-16">{m.manufacturer}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (m.count / Math.max(...manufacturers.map((x: any) => x.count), 1)) * 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                  </div>
                  <span className="text-xs font-medium text-slate-600">{m.count}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-300 text-center py-8">No data</p>}
        </div>
      </div>

      {/* Offline Meters List */}
      {offlineList.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">⚠️ Offline Meters</h3>
          <div className="space-y-2">
            {offlineList.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between bg-rose-50/50 rounded-xl p-3">
                <div>
                  <p className="text-xs font-medium text-slate-700">{m.meter_number}</p>
                  <p className="text-[10px] text-slate-400">{m.area || 'Unknown area'}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-rose-500 font-medium">{m.hours_offline ? `${m.hours_offline}h offline` : 'Offline'}</p>
                  <p className="text-[10px] text-slate-300">Balance: ₹{(m.balance_amount || 0).toFixed(0)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// LOAD & CONSUMPTION TAB (Module 4)
// ═══════════════════════════════════════════════════════════════════

const LoadTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const loadCurve = data.load_curve || [];
  const monthlyTrend = data.monthly_trend || [];
  const peak = data.peak_hour || { hour: 0, avg_kw: 0 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiMini label="Peak Hour" value={`${peak.hour}:00`} color="text-orange-600" bg="bg-orange-50" />
        <KpiMini label="Peak Load" value={`${peak.avg_kw} kW`} color="text-rose-600" bg="bg-rose-50" />
        <KpiMini label="Readings Today" value={data.readings_today || 0} color="text-cyan-600" bg="bg-cyan-50" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">24-Hour Load Curve</h3>
          {loadCurve.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={loadCurve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h: number) => `${h}:00`} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v: any) => [`${v} kW`, 'Avg Load']} />
                <Bar dataKey="avg_kw" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-300 text-center py-16">No load data today</p>}
        </div>
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Monthly Consumption Trend</h3>
          {monthlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} formatter={(v: any) => [`${v} kWh`, 'Total']} />
                <Bar dataKey="kwh" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-300 text-center py-16">No data</p>}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// OPTIMIZATION IMPACT TAB (Module 5)
// ═══════════════════════════════════════════════════════════════════

const OptimizationTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiMini label="Total Savings" value={`₹${(data.total_savings || 0).toLocaleString('en-IN')}`} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiMini label="Avg per Household" value={`₹${(data.avg_savings_per_household || 0).toFixed(0)}`} color="text-cyan-600" bg="bg-cyan-50" />
        <KpiMini label="Schedule Adoption" value={`${data.scheduling_adoption_percent || 0}%`} color="text-violet-600" bg="bg-violet-50" />
        <KpiMini label="CO₂ Reduced" value={`${(data.co2_reduction_kg || 0).toFixed(0)} kg`} color="text-green-600" bg="bg-green-50" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Recommendation Adoption</h3>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={[{ name: 'Acted', value: data.acted_recommendations || 0 }, { name: 'Pending', value: (data.total_recommendations || 0) - (data.acted_recommendations || 0) }]} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                  <Cell fill="#10b981" />
                  <Cell fill="#e2e8f0" />
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <LegendItem color="#10b981" label="Acted On" value={`${data.acted_recommendations || 0}`} />
              <LegendItem color="#e2e8f0" label="Pending" value={`${(data.total_recommendations || 0) - (data.acted_recommendations || 0)}`} />
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400">Adoption Rate</p>
                <p className="text-lg font-bold text-emerald-600">{data.recommendation_adoption_percent || 0}%</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6 flex flex-col justify-center items-center">
          <Leaf className="w-12 h-12 text-green-400 mb-3" />
          <p className="text-3xl font-bold text-green-600">{(data.co2_reduction_kg || 0).toFixed(0)} kg</p>
          <p className="text-xs text-slate-400 mt-1">CO₂ Emissions Prevented</p>
          <p className="text-[10px] text-slate-300 mt-2">≈ {((data.co2_reduction_kg || 0) / 21.77).toFixed(0)} trees planted equivalent</p>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// APPLIANCE ANALYTICS TAB (Module 6)
// ═══════════════════════════════════════════════════════════════════

const AppliancesTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const categories = data.categories || [];
  const topAppliances = data.top_appliances || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiMini label="Total Appliances" value={data.total_appliances || 0} color="text-blue-600" bg="bg-blue-50" />
        <KpiMini label="Avg per Home" value={data.avg_per_home || 0} color="text-violet-600" bg="bg-violet-50" />
        <KpiMini label="Currently ON" value={data.on_count || 0} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiMini label="Currently OFF" value={data.off_count || 0} color="text-slate-600" bg="bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">By Category</h3>
          {categories.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categories} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="category" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-300 text-center py-16">No data</p>}
        </div>
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Top Appliances</h3>
          <div className="space-y-2">
            {topAppliances.map((a: any, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-bold text-slate-300">#{i + 1}</span>
                <span className="text-xs text-slate-600 flex-1">{a.name}</span>
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.min(100, (a.count / (topAppliances[0]?.count || 1)) * 100)}%` }} />
                </div>
                <span className="text-xs font-medium text-slate-700 w-8 text-right">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-100 text-blue-600',
  in_progress: 'bg-amber-100 text-amber-600',
  assigned: 'bg-violet-100 text-violet-600',
  resolved: 'bg-emerald-100 text-emerald-600',
  closed: 'bg-slate-100 text-slate-500',
};

const PRIORITY_LABELS = ['', 'Critical', 'High', 'Medium', 'Low', 'Low'];
const PRIORITY_COLORS = ['', 'text-rose-600 bg-rose-50', 'text-orange-600 bg-orange-50', 'text-amber-600 bg-amber-50', 'text-slate-500 bg-slate-50', 'text-slate-400 bg-slate-50'];

const ComplaintsTab: React.FC<{ data: any }> = ({ data }) => {
  const [view, setView] = useState<'overview' | 'list' | 'detail'>('overview');
  const [complaints, setComplaints] = useState<any[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [complaintDetail, setComplaintDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [noteText, setNoteText] = useState('');
  const [updating, setUpdating] = useState(false);

  // Load complaint list
  const loadComplaints = useCallback(async () => {
    try {
      const result = await fetchComplaintList({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        limit: 50,
      });
      setComplaints(result.complaints || []);
      setListTotal(result.total || 0);
    } catch (e) { console.error(e); }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (view === 'list') loadComplaints();
  }, [view, loadComplaints]);

  // Load complaint detail
  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setView('detail');
    try {
      const detail = await fetchComplaintDetail(id);
      setComplaintDetail(detail);
    } catch (e) { console.error(e); }
    setLoadingDetail(false);
  };

  // Status update handler
  const handleStatusUpdate = async (newStatus: string, note?: string, resolutionNote?: string) => {
    if (!complaintDetail?.complaint?.id) return;
    setUpdating(true);
    try {
      await updateComplaintStatus(complaintDetail.complaint.id, {
        status: newStatus,
        note: note || `Status changed to ${newStatus}`,
        resolution_note: resolutionNote,
      });
      // Reload detail
      const detail = await fetchComplaintDetail(complaintDetail.complaint.id);
      setComplaintDetail(detail);
    } catch (e) { console.error(e); }
    setUpdating(false);
  };

  // Add note
  const handleAddNote = async () => {
    if (!noteText.trim() || !complaintDetail?.complaint?.id) return;
    try {
      await addComplaintNote(complaintDetail.complaint.id, noteText);
      setNoteText('');
      const detail = await fetchComplaintDetail(complaintDetail.complaint.id);
      setComplaintDetail(detail);
    } catch (e) { console.error(e); }
  };

  // OVERVIEW VIEW (analytics)
  if (view === 'overview') {
    if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
    const byType = data.type_distribution || [];
    const byStatus = data.status_distribution || [];
    const total = data.total_complaints || 0;
    const slaBreachPct = total > 0 ? Math.round(((data.sla_breach_count || 0) / total) * 100) : 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
            <KpiMini label="Total Complaints" value={total} color="text-slate-600" bg="bg-slate-100" />
            <KpiMini label="Pending" value={data.pending_complaints || 0} color="text-amber-600" bg="bg-amber-50" />
            <KpiMini label="Avg Resolution" value={`${(data.avg_resolution_hours || 0).toFixed(0)}h`} color="text-cyan-600" bg="bg-cyan-50" />
            <KpiMini label="SLA Breach %" value={`${slaBreachPct}%`} color="text-rose-600" bg="bg-rose-50" />
          </div>
          <button onClick={() => setView('list')}
            className="ml-3 flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-xl text-xs font-medium transition-colors whitespace-nowrap">
            <MessageSquare className="w-4 h-4" /> Manage Complaints
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">By Type</h3>
            {byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="type" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-slate-300 text-center py-16">No complaints</p>}
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">By Status</h3>
            {byStatus.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={byStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {byStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {byStatus.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-slate-500 flex-1 capitalize">{s.status}</span>
                      <span className="text-xs font-medium text-slate-700">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-xs text-slate-300 text-center py-16">No data</p>}
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('overview')} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h2 className="text-sm font-bold text-slate-700">All Complaints ({listTotal})</h2>
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 outline-none">
              <option value="">All Status</option>
              <option value="received">Received</option>
              <option value="in_progress">In Progress</option>
              <option value="assigned">Assigned</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 outline-none">
              <option value="">All Types</option>
              <option value="billing">Billing</option>
              <option value="outage">Outage</option>
              <option value="meter_error">Meter Error</option>
              <option value="payment">Payment</option>
              <option value="service">Service</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="px-4 py-3 text-slate-400 font-medium">ID</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Consumer</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Type</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Subject</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Priority</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">SLA</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {complaints.map((c: any) => (
                  <tr key={c.id} onClick={() => openDetail(c.id)}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono">{c.id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{c.profiles?.name || '-'}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-[10px] font-medium capitalize">{c.type}</span></td>
                    <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{c.subject}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_COLORS[c.priority] || PRIORITY_COLORS[3]}`}>{PRIORITY_LABELS[c.priority] || 'Medium'}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-500'}`}>{(c.status || '').replace('_', ' ')}</span></td>
                    <td className="px-4 py-3">
                      {c.sla_breached ? (
                        <span className="px-2 py-0.5 bg-rose-100 text-rose-600 rounded-full text-[10px] font-medium">Breached ({c.elapsed_hours}h/{c.sla_hours}h)</span>
                      ) : (
                        <span className="text-[10px] text-emerald-600">{c.elapsed_hours}h / {c.sla_hours}h</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : '-'}</td>
                  </tr>
                ))}
                {complaints.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-16 text-center text-slate-300">No complaints found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // DETAIL VIEW
  if (view === 'detail') {
    if (loadingDetail || !complaintDetail) {
      return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
    }
    const c = complaintDetail.complaint;
    const updates = complaintDetail.updates || [];
    const home = complaintDetail.home;
    const isOpen = !['resolved', 'closed'].includes(c.status);

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); loadComplaints(); }} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="text-sm font-bold text-slate-700">Complaint #{c.id?.slice(0, 8)}</h2>
              <p className="text-[10px] text-slate-400">{c.subject}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-500'}`}>{(c.status || '').replace('_', ' ')}</span>
            {c.sla_breached && <span className="px-3 py-1 bg-rose-100 text-rose-600 rounded-full text-xs font-medium">SLA Breached</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Complaint Info + Actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Complaint details card */}
            <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-slate-400">Type</p>
                  <p className="text-xs font-medium text-slate-700 capitalize">{c.type}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Priority</p>
                  <p className={`text-xs font-medium ${PRIORITY_COLORS[c.priority]?.split(' ')[0] || 'text-slate-600'}`}>{PRIORITY_LABELS[c.priority] || 'Medium'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Assigned To</p>
                  <p className="text-xs font-medium text-slate-700">{c.assigned_to || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">SLA</p>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-300" />
                    <p className={`text-xs font-medium ${c.sla_breached ? 'text-rose-600' : 'text-emerald-600'}`}>{c.elapsed_hours}h / {c.sla_hours}h</p>
                  </div>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[10px] text-slate-400 mb-1">Description</p>
                <p className="text-xs text-slate-600 leading-relaxed">{c.description}</p>
              </div>
              {c.resolution_note && (
                <div className="border-t border-slate-100 pt-3 mt-3">
                  <p className="text-[10px] text-slate-400 mb-1">Resolution Note</p>
                  <p className="text-xs text-emerald-600 leading-relaxed">{c.resolution_note}</p>
                </div>
              )}
            </div>

            {/* Status Actions */}
            {isOpen && (
              <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
                <h4 className="text-xs font-bold text-slate-700 mb-3">Update Status</h4>
                <div className="flex flex-wrap gap-2">
                  {c.status === 'received' && (
                    <>
                      <button disabled={updating} onClick={() => handleStatusUpdate('assigned', 'Complaint assigned to agent')}
                        className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">Assign</button>
                      <button disabled={updating} onClick={() => handleStatusUpdate('in_progress', 'Investigation started')}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">Start Work</button>
                    </>
                  )}
                  {c.status === 'assigned' && (
                    <button disabled={updating} onClick={() => handleStatusUpdate('in_progress', 'Work in progress')}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">Start Work</button>
                  )}
                  {['received', 'assigned', 'in_progress'].includes(c.status) && (
                    <button disabled={updating} onClick={() => {
                      const note = prompt('Resolution note:');
                      if (note !== null) handleStatusUpdate('resolved', 'Complaint resolved', note || undefined);
                    }}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Resolve
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
              <h4 className="text-xs font-bold text-slate-700 mb-4">Activity Timeline</h4>
              <div className="space-y-0">
                {/* Initial creation */}
                <div className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-blue-400" />
                    {updates.length > 0 && <div className="w-0.5 flex-1 bg-slate-100" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-xs font-medium text-slate-700">Complaint Created</p>
                    <p className="text-[10px] text-slate-400">{c.created_at ? new Date(c.created_at).toLocaleString('en-IN') : ''}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{c.subject}</p>
                  </div>
                </div>
                {/* Updates */}
                {updates.map((u: any, i: number) => (
                  <div key={u.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${u.status === 'resolved' ? 'bg-emerald-400' : u.status === 'in_progress' ? 'bg-amber-400' : 'bg-violet-400'}`} />
                      {i < updates.length - 1 && <div className="w-0.5 flex-1 bg-slate-100" />}
                    </div>
                    <div className="pb-4">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium capitalize ${STATUS_COLORS[u.status] || 'bg-slate-100 text-slate-500'}`}>{(u.status || '').replace('_', ' ')}</span>
                        {u.profiles?.name && <span className="text-[10px] text-slate-400">by {u.profiles.name}</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{u.created_at ? new Date(u.created_at).toLocaleString('en-IN') : ''}</p>
                      {u.note && <p className="text-xs text-slate-500 mt-1 bg-slate-50 rounded-lg px-2 py-1">{u.note}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Note */}
              {isOpen && (
                <div className="border-t border-slate-100 pt-3 mt-2">
                  <div className="flex gap-2">
                    <input value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Add internal note..." onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                      className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-violet-200 outline-none" />
                    <button onClick={handleAddNote} disabled={!noteText.trim()}
                      className="px-3 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors">
                      <Send className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Consumer Info */}
          <div className="space-y-4">
            <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
              <h4 className="text-xs font-bold text-slate-700 mb-3">Consumer Info</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-300" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{c.profiles?.name || '-'}</p>
                    <p className="text-[10px] text-slate-400">{c.profiles?.email}</p>
                  </div>
                </div>
                {c.profiles?.phone && <p className="text-[10px] text-slate-400 ml-6">{c.profiles.phone}</p>}
                {c.profiles?.consumer_number && <p className="text-[10px] text-slate-400 ml-6">#{c.profiles.consumer_number}</p>}
              </div>
              {c.user_id && (
                <button onClick={async () => {
                  try {
                    const result = await impersonateConsumer(c.user_id);
                    window.open(result.magic_link, '_blank');
                  } catch (e: any) { alert(e.message || 'Failed'); }
                }} className="mt-3 flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-700 font-medium transition-colors">
                  <ExternalLink className="w-3 h-3" /> Login as Consumer
                </button>
              )}
            </div>

            {home && (
              <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
                <h4 className="text-xs font-bold text-slate-700 mb-3">Location</h4>
                <div className="space-y-1">
                  {home.area && <p className="text-xs text-slate-500">Area: <span className="font-medium text-slate-700">{home.area}</span></p>}
                  {home.feeder_id && <p className="text-xs text-slate-500">Feeder: <span className="font-medium text-slate-700">{home.feeder_id}</span></p>}
                  {home.city && <p className="text-xs text-slate-500">{home.city}, {home.state}</p>}
                </div>
              </div>
            )}

            <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
              <h4 className="text-xs font-bold text-slate-700 mb-3">SLA Details</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Type</span>
                  <span className="text-slate-700 capitalize font-medium">{c.type}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">SLA Limit</span>
                  <span className="text-slate-700 font-medium">{c.sla_hours}h</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Elapsed</span>
                  <span className={`font-medium ${c.sla_breached ? 'text-rose-600' : 'text-emerald-600'}`}>{c.elapsed_hours}h</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${c.sla_breached ? 'bg-rose-400' : 'bg-emerald-400'}`}
                    style={{ width: `${Math.min(100, (c.elapsed_hours / c.sla_hours) * 100)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// ═══════════════════════════════════════════════════════════════════
// ADOPTION TAB (Module 9)
// ═══════════════════════════════════════════════════════════════════

const AdoptionTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const trend = data.signup_trend || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiMini label="Total Signups" value={data.total_signups || 0} color="text-blue-600" bg="bg-blue-50" />
        <KpiMini label="Onboarded" value={data.onboarded_users || 0} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiMini label="Onboarding Rate" value={`${data.onboarding_rate || 0}%`} color="text-cyan-600" bg="bg-cyan-50" />
        <KpiMini label="Appliance Adoption" value={`${data.appliance_onboarding_rate || 0}%`} color="text-violet-600" bg="bg-violet-50" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Signup Trend</h3>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <Bar dataKey="signups" fill="#06b6d4" radius={[4, 4, 0, 0]} name="Signups" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-300 text-center py-16">No data</p>}
        </div>
        <div className="bg-white rounded-[2rem] border border-slate-100/60 shadow-soft p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-4">Funnel</h3>
          <div className="space-y-3">
            <FunnelRow label="App Signups" value={data.total_signups || 0} max={data.total_signups || 1} color="#3b82f6" />
            <FunnelRow label="Onboarding Done" value={data.onboarded_users || 0} max={data.total_signups || 1} color="#06b6d4" />
            <FunnelRow label="Homes Created" value={data.total_homes || 0} max={data.total_signups || 1} color="#8b5cf6" />
            <FunnelRow label="Meters Linked" value={data.metered_homes || 0} max={data.total_signups || 1} color="#10b981" />
          </div>
        </div>
      </div>
    </div>
  );
};

const FunnelRow: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => (
  <div>
    <div className="flex justify-between text-xs mb-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / max) * 100)}%`, backgroundColor: color }} />
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// TARIFF & DISCOM TAB (Module 11)
// ═══════════════════════════════════════════════════════════════════

const TariffTab: React.FC<{ data: any }> = ({ data }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const discoms = data.discoms || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiMini label="Total DISCOMs" value={discoms.length} color="text-blue-600" bg="bg-blue-50" />
        <KpiMini label="Total Plans" value={discoms.reduce((s: number, d: any) => s + (d.tariff_plans?.length || 0), 0)} color="text-violet-600" bg="bg-violet-50" />
        <KpiMini label="Active Plans" value={discoms.reduce((s: number, d: any) => s + (d.tariff_plans?.filter((p: any) => p.is_active)?.length || 0), 0)} color="text-emerald-600" bg="bg-emerald-50" />
      </div>
      <div className="space-y-3">
        {discoms.map((d: any) => (
          <div key={d.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <button onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold">{d.code}</div>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-700">{d.name}</p>
                  <p className="text-[10px] text-slate-400">{d.state} • Consumer # Length: {d.consumer_number_length}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">{d.tariff_plans?.length || 0} plans</span>
                {expanded === d.id ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
              </div>
            </button>
            {expanded === d.id && d.tariff_plans && (
              <div className="border-t border-slate-100 px-4 pb-4 space-y-3">
                {d.tariff_plans.map((p: any) => (
                  <div key={p.id} className="bg-slate-50/50 rounded-xl p-3 mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-700">{p.name}</p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${p.is_active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mb-2">Category: {p.category} • Fixed: ₹{p.fixed_charge_per_kw}/kW • Effective: {p.effective_from}</p>
                    {p.tariff_slabs?.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-medium text-slate-500 mb-1">Slabs</p>
                        <div className="grid grid-cols-3 gap-1 text-[10px]">
                          <span className="font-medium text-slate-400">Range</span>
                          <span className="font-medium text-slate-400">Rate</span>
                          <span className="font-medium text-slate-400">Type</span>
                          {p.tariff_slabs.map((s: any, i: number) => (
                            <React.Fragment key={i}>
                              <span className="text-slate-600">{s.min_kwh}–{s.max_kwh || '∞'} kWh</span>
                              <span className="text-slate-600">₹{s.rate_per_kwh}</span>
                              <span className="text-slate-600">{s.slab_type || 'standard'}</span>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.tariff_slots?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-slate-500 mb-1">Time-of-Day Slots</p>
                        <div className="flex flex-wrap gap-1">
                          {p.tariff_slots.map((s: any, i: number) => (
                            <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full ${s.slot_type === 'peak' ? 'bg-rose-100 text-rose-600' : s.slot_type === 'off_peak' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                              {s.start_hour}:00–{s.end_hour}:00 ({s.slot_type}) ×{s.multiplier}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// OUTAGE TAB (Module 12)
// ═══════════════════════════════════════════════════════════════════

const OutageTab: React.FC<{ data: any; onRefresh: () => void }> = ({ data, onRefresh }) => {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ area: '', reason: '', start_time: '', estimated_end: '' });
  const [submitting, setSubmitting] = useState(false);

  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const outages = data.outages || [];
  const activeCount = outages.filter((o: any) => !o.is_resolved).length;

  const handleCreate = async () => {
    if (!form.area || !form.reason) return;
    setSubmitting(true);
    try {
      await createOutage({
        area: form.area, reason: form.reason,
        start_time: form.start_time || new Date().toISOString(),
        estimated_end: form.estimated_end || new Date(Date.now() + 4 * 3600000).toISOString(),
      });
      setCreating(false);
      setForm({ area: '', reason: '', start_time: '', estimated_end: '' });
      onRefresh();
    } catch (e) { console.error(e); }
    setSubmitting(false);
  };

  const handleResolve = async (id: string) => {
    try { await resolveOutage(id); onRefresh(); } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <KpiMini label="Active Outages" value={activeCount} color="text-rose-600" bg="bg-rose-50" />
          <KpiMini label="Total Records" value={data.total || 0} color="text-slate-600" bg="bg-slate-100" />
        </div>
        <button onClick={() => setCreating(!creating)}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-medium transition-colors">
          <Plus className="w-4 h-4" /> Report Outage
        </button>
      </div>

      {creating && (
        <div className="bg-white rounded-2xl border border-rose-200 p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700">New Outage Notice</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={form.area} onChange={e => setForm({ ...form, area: e.target.value })}
              placeholder="Affected Area" className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-200 outline-none" />
            <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="Reason" className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-200 outline-none" />
            <input type="datetime-local" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-200 outline-none" />
            <input type="datetime-local" value={form.estimated_end} onChange={e => setForm({ ...form, estimated_end: e.target.value })}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-rose-200 outline-none" />
          </div>
          <button onClick={handleCreate} disabled={submitting || !form.area || !form.reason}
            className="px-4 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors">
            {submitting ? 'Creating...' : 'Create & Notify Consumers'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {outages.map((o: any) => (
          <div key={o.id} className={`bg-white rounded-2xl border p-4 flex items-center justify-between ${o.is_resolved ? 'border-slate-100 opacity-60' : 'border-rose-200'}`}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${o.is_resolved ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                  {o.is_resolved ? 'Resolved' : 'Active'}
                </span>
                <span className="text-xs font-bold text-slate-700">{o.area}</span>
              </div>
              <p className="text-xs text-slate-500">{o.reason}</p>
              <p className="text-[10px] text-slate-300 mt-0.5">
                {o.start_time ? new Date(o.start_time).toLocaleString('en-IN') : ''} →{' '}
                {o.estimated_end ? new Date(o.estimated_end).toLocaleString('en-IN') : 'TBD'}
              </p>
            </div>
            {!o.is_resolved && (
              <button onClick={() => handleResolve(o.id)}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors">
                <CheckCircle2 className="w-3 h-3" /> Resolve
              </button>
            )}
          </div>
        ))}
        {outages.length === 0 && <p className="text-xs text-slate-300 text-center py-16">No outage records</p>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG TAB (Module 10)
// ═══════════════════════════════════════════════════════════════════

const AuditTab: React.FC<{ data: any }> = ({ data }) => {
  if (!data) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-cyan-500 animate-spin" /></div>;
  const logs = data.logs || [];

  return (
    <div className="space-y-4">
      <KpiMini label="Total Log Entries" value={data.total || 0} color="text-slate-600" bg="bg-slate-100" />
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-slate-400 font-medium">Timestamp</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Admin</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Action</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Table</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {logs.map((l: any) => (
                <tr key={l.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '-'}</td>
                  <td className="px-4 py-3 text-slate-600 font-medium">{l.admin_name || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-violet-100 text-violet-600 rounded-full text-[10px] font-medium">{l.action_type}</span></td>
                  <td className="px-4 py-3 text-slate-500">{l.target_table || '-'}</td>
                  <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">{l.new_value ? JSON.stringify(l.new_value).slice(0, 60) : '-'}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-16 text-center text-slate-300">No audit logs recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ── Shared Components ────────

const KpiMini: React.FC<{ label: string; value: any; color: string; bg: string }> = ({ label, value, color, bg }) => (
  <div className={`${bg} rounded-2xl p-4`}>
    <p className={`text-xl font-bold ${color}`}>{value}</p>
    <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
  </div>
);

const LegendItem: React.FC<{ color: string; label: string; value: string }> = ({ color, label, value }) => (
  <div className="flex items-center gap-2">
    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-xs font-bold text-slate-700 ml-auto">{value}</span>
  </div>
);

export default AdminDashboard;
