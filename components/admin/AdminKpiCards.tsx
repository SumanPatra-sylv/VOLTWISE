import React from 'react';
import { motion } from 'framer-motion';
import {
    Users, Zap, Activity, IndianRupee, AlertTriangle,
    TrendingUp, Clock, Leaf, Battery, Wifi, WifiOff, Shield
} from 'lucide-react';
import type { DashboardStats } from '../../services/adminApi';

interface KpiCardProps {
    icon: React.FC<{ className?: string }>;
    label: string;
    value: string | number;
    sub?: string;
    accent: string;
    iconBg: string;
    delay?: number;
    alert?: boolean;
    span?: number;
}

const KpiCard: React.FC<KpiCardProps> = ({ icon: Icon, label, value, sub, accent, iconBg, delay = 0, alert, span = 1 }) => (
    <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        transition={{ delay: delay * 0.05, duration: 0.35 }}
        className={`bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-lg transition-all relative overflow-hidden flex flex-col justify-between ${span === 2 ? 'col-span-2' : ''}`}
    >
        {alert && <div className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50" />}
        <div className={`w-12 h-12 rounded-2xl ${iconBg} flex items-center justify-center mb-4`}>
            <Icon className={`w-6 h-6 ${accent}`} />
        </div>
        <div>
            <p className={`text-3xl font-bold ${accent === 'text-rose-600' ? 'text-rose-600' : 'text-slate-800'} tracking-tight`}>{value}</p>
            <p className="text-sm text-slate-500 font-medium mt-1">{label}</p>
            {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
        </div>
    </motion.div>
);

interface Props { stats: DashboardStats }

const AdminKpiCards: React.FC<Props> = ({ stats }) => {
    const cards: KpiCardProps[] = [
        { icon: Users, label: 'Total Consumers', value: stats.total_consumers, accent: 'text-blue-600', iconBg: 'bg-blue-50' },
        { icon: Wifi, label: 'Active Meters', value: stats.active_meters, accent: 'text-emerald-600', iconBg: 'bg-emerald-50' },
        { icon: WifiOff, label: 'Offline Meters', value: stats.offline_meters, accent: 'text-rose-600', iconBg: 'bg-rose-50', alert: stats.offline_meters > 0 },
        { icon: IndianRupee, label: 'Monthly Revenue', value: `₹${stats.monthly_revenue.toLocaleString('en-IN')}`, accent: 'text-cyan-600', iconBg: 'bg-cyan-50' },
        { icon: IndianRupee, label: "Today's Revenue", value: `₹${stats.today_revenue.toLocaleString('en-IN')}`, accent: 'text-teal-600', iconBg: 'bg-teal-50' },
        { icon: Activity, label: 'Active Rechargers (7d)', value: stats.active_rechargers_7d, accent: 'text-violet-600', iconBg: 'bg-violet-50' },
        { icon: AlertTriangle, label: 'Critical Balance (<₹50)', value: stats.critical_balance_users, accent: 'text-rose-600', iconBg: 'bg-rose-50', alert: stats.critical_balance_users > 0 },
        { icon: Battery, label: 'Avg Balance', value: `₹${stats.avg_balance.toFixed(0)}`, accent: 'text-amber-600', iconBg: 'bg-amber-50' },
        { icon: Zap, label: 'Peak Load Today', value: `${stats.peak_load_today.toFixed(1)} kW`, accent: 'text-orange-600', iconBg: 'bg-orange-50' },
        { icon: Shield, label: 'Tariff Slot', value: stats.current_tariff_slot, accent: 'text-indigo-600', iconBg: 'bg-indigo-50' },
        { icon: Clock, label: 'Pending Complaints', value: stats.pending_complaints, accent: 'text-amber-600', iconBg: 'bg-amber-50', alert: stats.pending_complaints > 10 },
        { icon: TrendingUp, label: 'Avg Resolution', value: `${stats.avg_resolution_hours.toFixed(0)}h`, accent: 'text-slate-600', iconBg: 'bg-slate-100' },
        { icon: IndianRupee, label: 'Total Savings', value: `₹${stats.total_savings.toLocaleString('en-IN')}`, accent: 'text-emerald-600', iconBg: 'bg-emerald-50' },
        { icon: Leaf, label: 'CO₂ Saved', value: `${stats.co2_saved_this_month.toFixed(0)} kg`, accent: 'text-green-600', iconBg: 'bg-green-50' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {cards.map((c, i) => <KpiCard key={i} {...c} delay={i} />)}
        </div>
    );
};

export default AdminKpiCards;
