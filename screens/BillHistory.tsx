import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Download, TrendingDown, TrendingUp, Calendar, ChevronDown, FileText, Zap, IndianRupee, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { getBillingMonthlySummary, getBillingBillData, type BillingYearlySummary, type BillingMonthEntry, type BillData } from '../services/backend';
import { downloadBillPdf } from '../services/billPdfGenerator';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  viewMode?: ViewMode;
}

const BillHistory: React.FC<Props> = ({ onBack, viewMode = 'mobile' }) => {
  const { home } = useApp();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingYearlySummary | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<number | null>(null);
  
  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  // Fetch billing data
  const fetchData = useCallback(async () => {
    if (!home?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getBillingMonthlySummary(home.id, selectedYear);
      setSummary(data);
    } catch (err: any) {
      console.error('[BillHistory] Failed to fetch billing data:', err);
      setError(err.message || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [home?.id, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Download a single month's PDF
  const handleDownloadMonth = async (month: number) => {
    if (!home?.id || downloadingMonth !== null) return;
    setDownloadingMonth(month);
    try {
      const billData = await getBillingBillData(home.id, selectedYear, month);
      downloadBillPdf(billData);
    } catch (err: any) {
      console.error('[BillHistory] PDF download failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingMonth(null);
    }
  };

  // ── Derived data ──────────────────────────────────────────────
  const monthsWithData = summary?.months.filter(m => m.total_amount > 0) || [];
  const totalAnnual = summary?.annual_total || 0;
  const avgMonthly = summary?.avg_monthly || 0;
  const lowestMonth = summary?.lowest_month;
  const highestMonth = summary?.highest_month;
  const annualKwh = summary?.annual_kwh || 0;

  // Chart data
  const chartData = (summary?.months || []).map(m => ({
    name: m.month_short,
    amount: Math.round(m.total_amount),
    units: Math.round(m.total_kwh),
  }));

  // Bills list (most recent first, only months with data)
  const bills = [...monthsWithData]
    .sort((a, b) => b.month - a.month)
    .slice(0, 6);

  // Year options
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className={`pb-32 overflow-y-auto h-full no-scrollbar bg-slate-50 ${isCompact ? 'pt-6 px-6' : 'pt-8 px-5'}`}>
        <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={onBack}
            className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition-transform ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
          >
            <ArrowLeft className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
          <div className="flex-1">
            <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Bill History</h1>
            <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Track your electricity expenses</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
          <p className="text-sm text-slate-500 font-medium">Calculating your bills...</p>
          <p className="text-xs text-slate-400 mt-1">Processing smart meter intervals</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div className={`pb-32 overflow-y-auto h-full no-scrollbar bg-slate-50 ${isCompact ? 'pt-6 px-6' : 'pt-8 px-5'}`}>
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}>
            <ArrowLeft className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
          <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Bill History</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
            <Zap className="w-8 h-8 text-rose-400" />
          </div>
          <p className="text-sm text-slate-700 font-semibold mb-1">Couldn't load billing data</p>
          <p className="text-xs text-slate-500 text-center px-8">{error}</p>
          <button onClick={fetchData} className="mt-4 px-6 py-2 bg-cyan-500 text-white text-sm font-bold rounded-xl">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`pb-32 overflow-y-auto h-full no-scrollbar bg-slate-50 ${isCompact ? 'pt-6 px-6' : 'pt-8 px-5'}`}>
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={onBack}
          className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition-transform ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
        >
          <ArrowLeft className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        <div className="flex-1">
          <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Bill History</h1>
          <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Track your electricity expenses</p>
        </div>
        {/* Year Picker */}
        <div className="relative">
          <button 
            onClick={() => setShowYearPicker(!showYearPicker)}
            className={`bg-white border border-slate-200 shadow-sm flex items-center gap-2 ${isCompact ? 'px-3 py-1.5 rounded-lg' : 'px-4 py-2 rounded-xl'}`}
          >
            <Calendar className={`text-slate-500 ${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
            <span className={`font-bold text-slate-700 ${isCompact ? 'text-xs' : 'text-sm'}`}>{selectedYear}</span>
            <ChevronDown className={`text-slate-400 ${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          </button>
          {showYearPicker && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 shadow-lg rounded-xl overflow-hidden z-20">
              {yearOptions.map(yr => (
                <button
                  key={yr}
                  onClick={() => { setSelectedYear(yr); setShowYearPicker(false); }}
                  className={`block w-full px-5 py-2 text-sm font-semibold text-left hover:bg-cyan-50 transition-colors ${yr === selectedYear ? 'bg-cyan-50 text-cyan-700' : 'text-slate-700'}`}
                >
                  {yr}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Annual Summary Card */}
      <div className={`bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={`text-slate-400 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Total Spent in {selectedYear}</p>
            <h2 className={`font-bold flex items-center ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
              <IndianRupee className={isCompact ? 'w-5 h-5' : 'w-7 h-7'} />
              {Math.round(totalAnnual).toLocaleString()}
            </h2>
          </div>
          <div className={`bg-cyan-500/20 text-cyan-400 font-bold flex items-center gap-1 ${isCompact ? 'px-2 py-1 rounded-lg text-[10px]' : 'px-3 py-1.5 rounded-xl text-xs'}`}>
            <Zap className="w-3 h-3" />
            {Math.round(annualKwh).toLocaleString()} kWh
          </div>
        </div>

        {/* Mini Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-slate-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Avg/Month</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{Math.round(avgMonthly).toLocaleString()}</p>
          </div>
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-emerald-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Lowest</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{lowestMonth ? Math.round(lowestMonth.total_amount).toLocaleString() : '—'}</p>
            <p className={`text-slate-500 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>{lowestMonth?.month_short || '—'}</p>
          </div>
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-rose-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Highest</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{highestMonth ? Math.round(highestMonth.total_amount).toLocaleString() : '—'}</p>
            <p className={`text-slate-500 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>{highestMonth?.month_short || '—'}</p>
          </div>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
        <h3 className={`font-bold text-slate-800 mb-4 ${isCompact ? 'text-sm' : 'text-lg'}`}>Monthly Trend</h3>
        <div className={isCompact ? 'h-32' : 'h-44'}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="billGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e293b', 
                  border: 'none', 
                  borderRadius: '12px',
                  color: 'white'
                }}
                formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Amount']}
              />
              <Area 
                type="monotone" 
                dataKey="amount" 
                stroke="#06b6d4" 
                strokeWidth={2}
                fill="url(#billGradient)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Comparison */}
      <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
        <h3 className={`font-bold text-slate-800 mb-4 ${isCompact ? 'text-sm' : 'text-lg'}`}>Units Consumed</h3>
        <div className={isCompact ? 'h-32' : 'h-44'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ 
                  background: '#1e293b', 
                  border: 'none', 
                  borderRadius: '12px',
                  color: 'white'
                }}
                formatter={(value: number) => [`${value} kWh`, 'Units']}
              />
              <Bar 
                dataKey="units" 
                fill="#06b6d4"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bills List */}
      <div className="flex items-center justify-between mb-4">
        <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-lg'}`}>Recent Bills</h3>
      </div>

      {bills.length === 0 ? (
        <div className={`bg-white shadow-soft border border-slate-100 text-center py-10 ${isCompact ? 'rounded-2xl' : 'rounded-[2rem]'}`}>
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">No bills found for {selectedYear}</p>
          <p className="text-xs text-slate-400 mt-1">Bills will appear once smart meter data is processed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill, idx) => (
            <motion.div 
              key={bill.month}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                    <FileText className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                  </div>
                  <div>
                    <h4 className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{bill.month_name} {selectedYear}</h4>
                    <div className="flex items-center gap-2">
                      <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{Math.round(bill.total_kwh)} kWh</p>
                      <span className={`font-medium ${bill.status === 'paid' ? 'text-emerald-500' : bill.status === 'current' ? 'text-cyan-500' : 'text-amber-500'} ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                        {bill.status === 'paid' ? '✓ Paid' : bill.status === 'current' ? '● Current' : '⏳ Due ' + (bill.due_date || '')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{Math.round(bill.total_amount).toLocaleString()}</p>
                    {idx > 0 && bills[idx - 1].total_amount > 0 && (
                      <div className={`flex items-center gap-1 ${bill.total_amount < bills[idx - 1].total_amount ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {bill.total_amount < bills[idx - 1].total_amount ? (
                          <ArrowDownRight className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        <span className={isCompact ? 'text-[10px]' : 'text-xs'}>
                          {Math.abs(Math.round((bills[idx - 1].total_amount - bill.total_amount) / bills[idx - 1].total_amount * 100))}%
                        </span>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => handleDownloadMonth(bill.month)}
                    disabled={downloadingMonth !== null}
                    className={`rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center transition-all ${downloadingMonth === bill.month ? 'animate-pulse' : 'active:scale-95'} ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
                  >
                    {downloadingMonth === bill.month ? (
                      <Loader2 className={`animate-spin ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                    ) : (
                      <Download className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Download Annual Statement - only if there's data */}
      {monthsWithData.length > 0 && (
        <button 
          onClick={() => {
            // Download current month's bill as a starting point
            const latestMonth = bills[0]?.month;
            if (latestMonth) handleDownloadMonth(latestMonth);
          }}
          disabled={downloadingMonth !== null}
          className={`w-full mt-6 bg-slate-900 text-white font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
        >
          {downloadingMonth !== null ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Download className="w-5 h-5" />
          )}
          Download Latest Bill
        </button>
      )}
    </div>
  );
};

export default BillHistory;
