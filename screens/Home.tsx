
import React from 'react';
import LiquidGauge from '../components/LiquidGauge';
import ApplianceCard from '../components/ApplianceCard';
import { MOCK_APPLIANCES, DASHBOARD_STATS } from '../constants';
import { Zap, DollarSign, AlertTriangle, ArrowRight, MoreHorizontal } from 'lucide-react';
import { motion } from 'framer-motion';
import { Tab } from '../types';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface HomeProps {
    onNavigate: (tab: Tab) => void;
    viewMode?: ViewMode;
}

const Home: React.FC<HomeProps> = ({ onNavigate, viewMode = 'mobile' }) => {
  const isWeb = viewMode === 'web';
  const isTablet = viewMode === 'tablet';
  const isCompact = isWeb || isTablet;
  
  return (
    <div className={`pt-6 pb-32 overflow-y-auto h-full no-scrollbar relative ${isWeb ? 'px-8' : 'px-5'}`}>
      {/* Header */}
      <header className="flex justify-between items-center mb-4">
        <div>
            <h1 className={`text-slate-500 font-medium ${isCompact ? 'text-xs' : 'text-sm'}`}>Good Morning,</h1>
            <h2 className={`font-bold text-slate-800 tracking-tight ${isCompact ? 'text-xl' : 'text-2xl'}`}>Rohit Sharma</h2>
        </div>
        <button 
            onClick={() => onNavigate('Profile')}
            className={`rounded-full bg-white border border-slate-100 shadow-sm flex items-center justify-center text-slate-800 font-bold hover:shadow-md transition-shadow ${isCompact ? 'w-10 h-10 text-sm' : 'w-12 h-12'}`}
        >
            RS
        </button>
      </header>

      {/* BENTO GRID LAYOUT - Responsive */}
      <div className={`grid gap-3 mb-6 ${isWeb ? 'grid-cols-4' : isTablet ? 'grid-cols-4' : 'grid-cols-2 gap-4'}`}>
        
        {/* Item 1: Hero Liquid Gauge */}
        <motion.div 
            initial={isCompact ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-white shadow-soft border border-slate-100 relative overflow-hidden flex flex-col items-center justify-center ${
              isWeb ? 'col-span-2 row-span-2 rounded-2xl p-4 min-h-[280px]' 
              : isTablet ? 'col-span-2 row-span-2 rounded-2xl p-4 min-h-[240px]'
              : 'col-span-2 rounded-[2rem] p-6 min-h-[380px]'
            }`}
        >
             {/* Background Decoration */}
            <div className={`absolute top-0 right-0 bg-cyan-50 rounded-bl-[4rem] -z-0 ${isCompact ? 'w-20 h-20' : 'w-32 h-32'}`}></div>
            
            <div className={`flex justify-between w-full items-start absolute px-4 z-10 ${isCompact ? 'top-3' : 'top-6 px-6'}`}>
                <span className={`bg-rose-50 text-rose-600 rounded-full font-bold uppercase tracking-wider border border-rose-100 ${isCompact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'}`}>Peak Hour</span>
                <MoreHorizontal className={`text-slate-300 ${isCompact ? 'w-4 h-4' : ''}`} />
            </div>

            <LiquidGauge 
                value={72} 
                label={`₹${DASHBOARD_STATS.currentTariff}/hr`}
                subLabel={`Peak Hour Ends in ${DASHBOARD_STATS.peakEndsIn}`}
                isPeak={true}
                compact={isCompact}
            />
            
             {/* Stats Footer */}
             <div className={`w-full flex justify-between items-center px-4 relative z-10 ${isCompact ? 'mt-4' : 'mt-10'}`}>
                 <div className="text-center">
                    <p className={`text-slate-400 font-medium uppercase tracking-wide ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Current Load</p>
                    <p className={`text-slate-800 font-bold ${isCompact ? 'text-base' : 'text-xl'}`}>{DASHBOARD_STATS.currentLoad} kW</p>
                 </div>
                 <div className={`bg-slate-100 ${isCompact ? 'h-8 w-[1px]' : 'h-10 w-[1px]'}`}></div>
                 <div className="text-center">
                     <p className={`text-slate-400 font-medium uppercase tracking-wide ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Today's Usage</p>
                     <div className="flex flex-col">
                        <span className={`text-slate-800 font-bold leading-none ${isCompact ? 'text-base' : 'text-xl'}`}>₹{DASHBOARD_STATS.todayCost.toFixed(2)}</span>
                        <span className={`text-slate-400 font-bold mt-1 ${isCompact ? 'text-[9px]' : 'text-xs'}`}>{DASHBOARD_STATS.todayKwh} kWh</span>
                     </div>
                 </div>
             </div>
        </motion.div>

        {/* Item 2: Quick Stat - Forecast */}
        <motion.div 
             initial={isCompact ? false : { opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: isCompact ? 0 : 0.1 }}
             whileHover={isCompact ? {} : { scale: 1.02 }}
             className={`bg-white shadow-soft border border-slate-100 flex flex-col justify-between ${
               isCompact ? 'rounded-xl p-3 h-28' : 'rounded-[2rem] p-5 h-40'
             }`}
        >
            <div className={`rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl mb-2'}`}>
                <Zap className={`fill-current ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </div>
            <div>
                <p className={`text-slate-500 font-medium mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Month Forecast</p>
                <div className="flex items-end gap-1">
                    <span className={`font-bold text-slate-800 ${isCompact ? 'text-base' : 'text-xl'}`}>₹{DASHBOARD_STATS.monthBill}</span>
                </div>
                <div className={`w-full bg-slate-100 rounded-full mt-2 overflow-hidden ${isCompact ? 'h-1' : 'h-1.5'}`}>
                    <div className="bg-indigo-500 w-[70%] h-full rounded-full"></div>
                </div>
            </div>
        </motion.div>

        {/* Item 3: Quick Stat - Savings */}
        <motion.div 
             initial={isCompact ? false : { opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: isCompact ? 0 : 0.2 }}
             whileHover={isCompact ? {} : { scale: 1.02 }}
             className={`bg-slate-900 shadow-soft text-white relative overflow-hidden flex flex-col justify-between ${
               isCompact ? 'rounded-xl p-3 h-28' : 'rounded-[2rem] p-5 h-40'
             }`}
        >
            <div className={`absolute right-0 top-0 bg-white/10 rounded-bl-full ${isCompact ? 'w-14 h-14' : 'w-20 h-20'}`}></div>
            <div className={`rounded-xl bg-white/10 flex items-center justify-center text-emerald-400 backdrop-blur-sm ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl mb-2'}`}>
                <DollarSign className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
            </div>
            <div>
                <p className={`text-slate-300 font-medium mb-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Total Savings</p>
                <div className="flex items-end gap-1">
                    <span className={`font-bold ${isCompact ? 'text-base' : 'text-xl'}`}>₹{DASHBOARD_STATS.monthSavings}</span>
                    <span className={`text-emerald-400 mb-0.5 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>+12%</span>
                </div>
                <p className={`text-slate-400 mt-0.5 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>vs last month</p>
            </div>
        </motion.div>

        {/* Item 4: Wide Banner - Alert */}
        <motion.div 
            initial={isCompact ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isCompact ? 0 : 0.3 }}
            whileHover={isCompact ? {} : { scale: 1.01 }}
            className={`bg-rose-50 border border-rose-100 flex items-center justify-between ${
              isCompact ? 'col-span-2 rounded-xl p-3' : 'col-span-2 rounded-[2rem] p-5'
            }`}
        >
            <div className="flex items-center gap-3">
                <div className={`rounded-full bg-white flex items-center justify-center shadow-sm text-rose-500 ${isCompact ? 'w-9 h-9' : 'w-12 h-12 animate-pulse-slow'}`}>
                    <AlertTriangle className={isCompact ? 'w-4 h-4' : 'w-6 h-6'} />
                </div>
                <div>
                    <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : ''}`}>High Usage Alert</h3>
                    <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Consider turning off AC to save ₹32/hr</p>
                </div>
            </div>
            <button 
                onClick={() => onNavigate('Optimizer')}
                className={`bg-rose-500 text-white font-bold shadow-lg shadow-rose-200 hover:scale-105 transition-transform ${isCompact ? 'px-3 py-1.5 rounded-lg text-[10px]' : 'px-4 py-2 rounded-xl text-xs'}`}
            >
                Fix
            </button>
        </motion.div>
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
