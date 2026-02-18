import React, { useState } from 'react';
import { MOCK_APPLIANCES } from '../constants';
import { Power, Bot, Sliders, Settings2, Zap } from 'lucide-react';
import ApplianceCard from '../components/ApplianceCard'; // Reuse the new smart tile
import { motion } from 'framer-motion';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface ControlProps {
  viewMode?: ViewMode;
}

const Control: React.FC<ControlProps> = ({ viewMode = 'mobile' }) => {
  const [autoMode, setAutoMode] = useState(true);
  const isWeb = viewMode === 'web';
  const isTablet = viewMode === 'tablet';
  const isCompact = isWeb || isTablet;

  return (
    <div className={`pb-32 overflow-y-auto h-full no-scrollbar ${isCompact ? 'pt-6 px-6' : 'pt-10 px-5'}`}>
      
      <div className={`flex justify-between items-center ${isCompact ? 'mb-4' : 'mb-8'}`}>
         <h2 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Control Center</h2>
         <button className={`bg-white rounded-full border border-slate-200 shadow-sm text-slate-500 hover:rotate-90 transition-transform duration-500 ${isCompact ? 'p-1.5' : 'p-2'}`}>
            <Settings2 className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
         </button>
      </div>
      
      {/* Mode Toggle Switcher */}
      <div className={`bg-slate-100 p-1.5 flex relative ${isCompact ? 'rounded-xl mb-4' : 'rounded-[1.5rem] mb-8'}`}>
        <div 
            className={`absolute top-1.5 bottom-1.5 w-[48%] bg-white shadow-sm transition-all duration-300 ease-spring ${isCompact ? 'rounded-lg' : 'rounded-2xl'} ${autoMode ? 'left-1.5' : 'left-[50.5%]'}`}
        ></div>
        <button 
            onClick={() => setAutoMode(true)}
            className={`flex-1 text-sm font-bold relative z-10 flex items-center justify-center gap-2 transition-colors ${isCompact ? 'py-2 rounded-lg text-xs' : 'py-3 rounded-xl'} ${autoMode ? 'text-slate-800' : 'text-slate-400'}`}
        >
            <Bot className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} /> Auto-Pilot
        </button>
        <button 
            onClick={() => setAutoMode(false)}
            className={`flex-1 text-sm font-bold relative z-10 flex items-center justify-center gap-2 transition-colors ${isCompact ? 'py-2 rounded-lg text-xs' : 'py-3 rounded-xl'} ${!autoMode ? 'text-slate-800' : 'text-slate-400'}`}
        >
            <Sliders className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} /> Manual
        </button>
      </div>

      <motion.div 
        initial={isCompact ? false : { opacity: 0, height: 0 }}
        animate={{ opacity: autoMode ? 1 : 0, height: autoMode ? 'auto' : 0 }}
        className="overflow-hidden"
      >
          <div className={`bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-start gap-3 ${isCompact ? 'mb-4 p-3 rounded-xl' : 'mb-8 p-5 rounded-[2rem]'}`}>
            <div className={`mt-1 rounded-full bg-emerald-400 animate-pulse shadow-glow ${isCompact ? 'min-w-[8px] h-2' : 'min-w-[12px] h-3'}`}></div>
            <div>
                <h4 className={`font-bold text-emerald-800 mb-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>AI Optimisation Active</h4>
                <p className={`text-emerald-700/70 leading-relaxed ${isCompact ? 'text-[10px]' : 'text-xs'}`}>System is automatically managing heavy appliances to keep bill under ₹2,400.</p>
            </div>
          </div>
      </motion.div>

      {/* Appliance List - Grid */}
      <div className={isCompact ? 'space-y-4' : 'space-y-8'}>
        <div>
            <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>Quick Actions</h3>
            <div className={`grid gap-3 ${isWeb ? 'grid-cols-4' : isTablet ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {MOCK_APPLIANCES.map((app, idx) => (
                   <motion.div
                        key={app.id}
                        initial={isCompact ? false : { opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: isCompact ? 0 : 0.05 * idx }}
                   >
                       <ApplianceCard data={app} compact={isCompact} />
                   </motion.div>
                ))}
            </div>
        </div>

        <div>
            <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>Active Rules</h3>
            <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <motion.div whileHover={isCompact ? {} : { scale: 1.01 }} className={`bg-white border border-slate-100 shadow-soft flex flex-col gap-2 ${isCompact ? 'rounded-xl p-3' : 'rounded-[2rem] p-5 gap-3'}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                             <div className={`rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl'}`}>
                                <Zap className={`fill-current ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                             </div>
                             <h4 className={`text-slate-800 font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>Peak Protection</h4>
                        </div>
                        <span className={`bg-emerald-50 text-emerald-600 rounded-lg font-bold ${isCompact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'}`}>Active</span>
                    </div>
                    <p className={`text-slate-400 font-medium ${isCompact ? 'text-[10px] pl-10' : 'text-xs pl-12'}`}>Stops AC/Geyser when rate {'>'} ₹9</p>
                </motion.div>

                 <motion.div whileHover={isCompact ? {} : { scale: 1.01 }} className={`bg-white border-l-4 border-l-rose-500 border-y border-r border-slate-100 shadow-soft flex flex-col gap-2 ${isCompact ? 'rounded-xl p-3' : 'rounded-[2rem] p-5 gap-3'}`}>
                    <div className="flex justify-between items-center">
                         <div className="flex items-center gap-2">
                             <div className={`rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl'}`}>
                                <Bot className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                             </div>
                             <h4 className={`text-slate-800 font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>Budget Guardian</h4>
                        </div>
                        <span className={`bg-rose-50 text-rose-600 rounded-lg font-bold ${isCompact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'}`}>Triggered</span>
                    </div>
                    <p className={`text-slate-400 font-medium ${isCompact ? 'text-[10px] pl-10' : 'text-xs pl-12'}`}>Monthly limit (80%) reached.</p>
                </motion.div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Control;