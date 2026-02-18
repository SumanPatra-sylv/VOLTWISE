import React, { useState } from 'react';
import { ArrowLeft, Download, TrendingDown, TrendingUp, Calendar, ChevronDown, FileText, Zap, IndianRupee, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  viewMode?: ViewMode;
}

const BillHistory: React.FC<Props> = ({ onBack, viewMode = 'mobile' }) => {
  const [selectedYear, setSelectedYear] = useState(2024);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  
  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  const monthlyData = [
    { month: 'Jan', amount: 2450, units: 245, trend: 'up' },
    { month: 'Feb', amount: 2180, units: 218, trend: 'down' },
    { month: 'Mar', amount: 2320, units: 232, trend: 'up' },
    { month: 'Apr', amount: 2890, units: 289, trend: 'up' },
    { month: 'May', amount: 3420, units: 342, trend: 'up' },
    { month: 'Jun', amount: 3850, units: 385, trend: 'up' },
    { month: 'Jul', amount: 3620, units: 362, trend: 'down' },
    { month: 'Aug', amount: 3280, units: 328, trend: 'down' },
    { month: 'Sep', amount: 2950, units: 295, trend: 'down' },
    { month: 'Oct', amount: 2680, units: 268, trend: 'down' },
    { month: 'Nov', amount: 2420, units: 242, trend: 'down' },
    { month: 'Dec', amount: 2560, units: 256, trend: 'up' },
  ];

  const chartData = monthlyData.map(d => ({
    name: d.month,
    amount: d.amount,
    units: d.units,
  }));

  const totalAnnual = monthlyData.reduce((sum, m) => sum + m.amount, 0);
  const avgMonthly = Math.round(totalAnnual / 12);
  const lowestMonth = monthlyData.reduce((min, m) => m.amount < min.amount ? m : min);
  const highestMonth = monthlyData.reduce((max, m) => m.amount > max.amount ? m : max);
  const savedThisYear = 4200;

  const bills = [
    { id: 1, month: 'December 2024', amount: 2560, units: 256, dueDate: 'Jan 15, 2025', status: 'pending' },
    { id: 2, month: 'November 2024', amount: 2420, units: 242, dueDate: 'Dec 15, 2024', status: 'paid' },
    { id: 3, month: 'October 2024', amount: 2680, units: 268, dueDate: 'Nov 15, 2024', status: 'paid' },
    { id: 4, month: 'September 2024', amount: 2950, units: 295, dueDate: 'Oct 15, 2024', status: 'paid' },
    { id: 5, month: 'August 2024', amount: 3280, units: 328, dueDate: 'Sep 15, 2024', status: 'paid' },
  ];

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
        <div className={`bg-white border border-slate-200 shadow-sm flex items-center gap-2 ${isCompact ? 'px-3 py-1.5 rounded-lg' : 'px-4 py-2 rounded-xl'}`}>
          <Calendar className={`text-slate-500 ${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
          <span className={`font-bold text-slate-700 ${isCompact ? 'text-xs' : 'text-sm'}`}>{selectedYear}</span>
          <ChevronDown className={`text-slate-400 ${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
        </div>
      </div>

      {/* Annual Summary Card */}
      <div className={`bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-xl mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={`text-slate-400 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Total Spent in {selectedYear}</p>
            <h2 className={`font-bold flex items-center ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
              <IndianRupee className={isCompact ? 'w-5 h-5' : 'w-7 h-7'} />
              {totalAnnual.toLocaleString()}
            </h2>
          </div>
          <div className={`bg-emerald-500/20 text-emerald-400 font-bold flex items-center gap-1 ${isCompact ? 'px-2 py-1 rounded-lg text-[10px]' : 'px-3 py-1.5 rounded-xl text-xs'}`}>
            <TrendingDown className="w-4 h-4" />
            ₹{savedThisYear} saved
          </div>
        </div>

        {/* Mini Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-slate-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Avg/Month</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{avgMonthly}</p>
          </div>
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-emerald-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Lowest</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{lowestMonth.amount}</p>
            <p className={`text-slate-500 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>{lowestMonth.month}</p>
          </div>
          <div className={`bg-white/5 text-center ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
            <p className={`text-rose-400 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>Highest</p>
            <p className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{highestMonth.amount}</p>
            <p className={`text-slate-500 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>{highestMonth.month}</p>
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
                formatter={(value: number) => [`₹${value}`, 'Amount']}
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
        <button className={`text-cyan-600 font-bold flex items-center gap-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
          View All <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {bills.map((bill, idx) => (
          <motion.div 
            key={bill.id}
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
                  <h4 className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{bill.month}</h4>
                  <div className="flex items-center gap-2">
                    <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{bill.units} kWh</p>
                    <span className={`font-medium ${bill.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'} ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                      {bill.status === 'paid' ? '✓ Paid' : '⏳ Due ' + bill.dueDate}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-lg'}`}>₹{bill.amount}</p>
                  {idx > 0 && (
                    <div className={`flex items-center gap-1 ${bill.amount < bills[idx - 1].amount ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {bill.amount < bills[idx - 1].amount ? (
                        <ArrowDownRight className="w-3 h-3" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3" />
                      )}
                      <span className={isCompact ? 'text-[10px]' : 'text-xs'}>
                        {Math.abs(Math.round((bills[idx - 1].amount - bill.amount) / bills[idx - 1].amount * 100))}%
                      </span>
                    </div>
                  )}
                </div>
                <button className={`rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}>
                  <Download className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Download All Button */}
      <button className={`w-full mt-6 bg-slate-900 text-white font-bold shadow-lg flex items-center justify-center gap-2 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}>
        <Download className="w-5 h-5" /> Download Annual Statement
      </button>
    </div>
  );
};

export default BillHistory;
