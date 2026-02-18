import React from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TARIFF_RATES } from '../constants';
import { ArrowLeft, Clock, Zap, TrendingDown, Calendar, Check } from 'lucide-react';
import { Tab } from '../types';

interface Props {
  onBack: () => void;
}

const TariffOptimizer: React.FC<Props> = ({ onBack }) => {
  
  const getBarColor = (type: string) => {
      switch(type) {
          case 'peak': return '#ef4444'; // Red-500
          case 'normal': return '#f59e0b'; // Amber-500
          case 'off-peak': return '#10b981'; // Emerald-500
          default: return '#cbd5e1';
      }
  };

  return (
    <div className="pt-8 pb-32 px-5 overflow-y-auto h-full no-scrollbar bg-slate-50">
      
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
          <button 
            onClick={onBack}
            className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition-transform"
          >
              <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
              <h1 className="text-2xl font-bold text-slate-800">Tariff Optimizer</h1>
              <p className="text-xs text-slate-500 font-medium">Smart recommendations to reduce bills</p>
          </div>
      </div>

      {/* Hero Savings Card */}
      <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-6 flex items-center justify-between">
          <div>
              <div className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Potential Daily Savings</div>
              <div className="text-3xl font-bold text-emerald-600">₹150</div>
          </div>
          <div className="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center animate-pulse-slow">
              <TrendingDown className="w-7 h-7" />
          </div>
      </div>

      {/* 24-Hour Tariff Chart */}
      <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
             <h3 className="font-bold text-slate-800">24-Hour Tariff Rates</h3>
             <div className="flex gap-2 text-[10px] font-bold">
                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Off-Peak</span>
                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Normal</span>
                 <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Peak</span>
             </div>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TARIFF_RATES} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                    <XAxis 
                        dataKey="hour" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }} 
                        interval={1}
                    />
                    <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={(value) => `₹${value}`}
                    />
                    <Tooltip 
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={20}>
                        {TARIFF_RATES.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2 font-medium">Peak hours are 8AM-12PM & 6PM-10PM</p>
      </div>

      {/* Smart Recommendations */}
      <h3 className="text-lg font-bold text-slate-800 mb-4 px-1">Smart Recommendations</h3>
      <div className="space-y-4">
          
          {/* Recommendation 1 */}
          <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-5 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-[4rem] -z-0"></div>
             
             <div className="flex items-start gap-4 mb-3 relative z-10">
                 <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                     <Zap className="w-5 h-5 fill-current" />
                 </div>
                 <div className="flex-1">
                     <h4 className="font-bold text-slate-800">Washing Machine</h4>
                     <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-xs font-medium">
                        <Clock className="w-3 h-3" /> Run at <span className="text-indigo-600 font-bold">10 PM</span>
                     </div>
                 </div>
             </div>

             <div className="flex justify-between items-end">
                 <p className="text-xs text-slate-400 font-medium max-w-[60%]">Off-peak electricity rates apply.</p>
                 <div className="text-right">
                     <div className="text-xs text-slate-400 line-through font-medium">₹45</div>
                     <div className="flex items-center gap-1">
                        <span className="text-xl font-bold text-emerald-600">₹25</span>
                        <div className="bg-emerald-50 text-emerald-600 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-100">
                            Save ₹20
                        </div>
                     </div>
                 </div>
             </div>
             
             <button className="w-full mt-4 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-colors">
                <Calendar className="w-4 h-4" /> Schedule Now
             </button>
          </div>

          {/* Recommendation 2 */}
          <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-5">
             <div className="flex items-start gap-4 mb-3">
                 <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center">
                     <TrendingDown className="w-5 h-5" />
                 </div>
                 <div className="flex-1">
                     <h4 className="font-bold text-slate-800">AC Optimisation</h4>
                     <p className="text-xs text-slate-500 mt-1">Pre-cool room before 6 PM peak</p>
                 </div>
             </div>
             <button className="w-full mt-2 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-200">
                View Details
             </button>
          </div>

      </div>
    </div>
  );
};

export default TariffOptimizer;