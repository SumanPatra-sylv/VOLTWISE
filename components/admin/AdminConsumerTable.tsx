import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Eye, AlertTriangle, CheckCircle, Clock, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import type { ConsumerRow } from '../../services/adminApi';
import { impersonateConsumer } from '../../services/adminApi';

interface Props {
    consumers: ConsumerRow[];
    onViewProfile: (userId: string) => void;
}

const PAGE_SIZE = 15;

const AdminConsumerTable: React.FC<Props> = ({ consumers, onViewProfile }) => {
    const [search, setSearch] = useState('');
    const [balanceFilter, setBalanceFilter] = useState<string>('all');
    const [page, setPage] = useState(0);

    const filtered = consumers.filter(u => {
        const q = search.toLowerCase();
        const matchesSearch = !q ||
            (u.name || '').toLowerCase().includes(q) ||
            (u.phone || '').includes(q) ||
            (u.consumer_number || '').includes(q) ||
            (u.email || '').toLowerCase().includes(q);

        const bal = u.balance ?? 0;
        const matchesBalance =
            balanceFilter === 'all' ? true :
                balanceFilter === 'critical' ? bal < 50 :
                    balanceFilter === 'low' ? (bal >= 50 && bal < 200) :
                        bal >= 200;

        return matchesSearch && matchesBalance;
    });

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const balanceColor = (b: number) =>
        b < 50 ? 'text-rose-600 bg-rose-50' :
            b < 200 ? 'text-amber-600 bg-amber-50' :
                'text-emerald-600 bg-emerald-50';

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-[2rem] border border-slate-100 shadow-soft overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-slate-800">Consumers</h2>
                    <div className="flex items-center gap-2">
                        {/* Balance filter pills */}
                        {['all', 'critical', 'low', 'normal'].map(f => (
                            <button key={f} onClick={() => { setBalanceFilter(f); setPage(0); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${balanceFilter === f
                                    ? 'bg-slate-800 text-white'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}>
                                {f === 'all' ? 'All' : f === 'critical' ? '🔴 Critical' : f === 'low' ? '🟡 Low' : '🟢 Normal'}
                            </button>
                        ))}
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" placeholder="Search consumers..." value={search}
                                onChange={e => { setSearch(e.target.value); setPage(0); }}
                                className="pl-11 pr-4 py-2 border-none bg-slate-100/50 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 rounded-full w-56 text-sm outline-none transition-all" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto px-2">
                <table className="w-full border-collapse">
                    <thead className="bg-white sticky top-0 z-10">
                        <tr>
                            {['Consumer', 'Consumer #', 'Home', 'Balance', 'Recharges', 'Status', 'Actions'].map(h => (
                                <th key={h} className="px-5 py-4 text-left text-[11px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50/50">
                        {paginated.length === 0 ? (
                            <tr><td colSpan={7} className="py-16 text-center text-slate-400 font-medium">No consumers match your filters</td></tr>
                        ) : paginated.map((u, idx) => (
                            <tr key={u.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => onViewProfile(u.id)}>
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-50 to-blue-50 flex items-center justify-center text-cyan-600 font-bold text-sm shadow-sm">
                                            {(u.name || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-700 text-sm">{u.name}</p>
                                            <p className="text-[11px] text-slate-300">{u.email || u.phone || '—'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-5 py-4"><span className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded-md">{u.consumer_number || '—'}</span></td>
                                <td className="px-5 py-4"><span className="text-xs text-slate-600 font-medium">{u.home_name || '—'}</span></td>
                                <td className="px-5 py-4">
                                    <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${balanceColor(u.balance ?? 0)}`}>
                                        ₹{(u.balance ?? 0).toFixed(0)}
                                    </span>
                                </td>
                                <td className="px-5 py-4">
                                    <div className="text-xs text-slate-600">
                                        <span className="font-bold">{u.total_recharges || 0}</span>
                                        <span className="text-slate-400 ml-1">· ₹{((u.total_recharge_amount || 0) / 1000).toFixed(1)}k</span>
                                    </div>
                                </td>
                                <td className="px-5 py-4">
                                    {u.onboarding_done ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-medium">
                                            <CheckCircle className="w-3 h-3" /> Active
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-500 text-[11px] font-medium">
                                            <Clock className="w-3 h-3" /> Pending
                                        </span>
                                    )}
                                </td>
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-700 transition-colors" onClick={e => { e.stopPropagation(); onViewProfile(u.id); }} title="View Profile">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button className="p-2 hover:bg-cyan-100 rounded-full text-slate-400 hover:text-cyan-600 transition-colors" onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const result = await impersonateConsumer(u.id);
                                                window.open(result.magic_link, '_blank');
                                            } catch (err: any) { alert(err.message || 'Failed to impersonate'); }
                                        }} title="Login as Consumer">
                                            <ExternalLink className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-400">{filtered.length} consumers found</p>
                {totalPages > 1 && (
                    <div className="flex items-center gap-2 bg-slate-50 rounded-full p-1 border border-slate-100">
                        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                            className="p-1.5 rounded-full hover:bg-white hover:shadow-sm disabled:opacity-30 text-slate-500 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                        <span className="text-xs font-bold text-slate-600 px-3">{page + 1} <span className="text-slate-400 font-normal">/ {totalPages}</span></span>
                        <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="p-1.5 rounded-full hover:bg-white hover:shadow-sm disabled:opacity-30 text-slate-500 transition-all"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default AdminConsumerTable;
