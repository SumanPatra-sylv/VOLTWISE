import React from 'react';
import { motion } from 'framer-motion';

interface LiquidGaugeProps {
  value: number; // 0 to 100
  label: string;
  subLabel: string;
  isPeak: boolean;
  compact?: boolean;
}

const LiquidGauge: React.FC<LiquidGaugeProps> = ({ value, label, subLabel, isPeak, compact = false }) => {
  // Map value to percentage of height (0% is empty, 100% is full)
  // We actually animate the "top" property. 100% top = empty. 0% top = full.
  const topPos = 100 - value;

  const size = compact ? 'w-36 h-36' : 'w-56 h-56';

  return (
    <div className={`relative ${size} my-2`}>
      {/* Outer Container Ring */}
      <div className="absolute inset-0 rounded-full border border-slate-100 bg-slate-50 shadow-inner z-0"></div>
      
      {/* Pulsing Ring Indicator - only on non-compact */}
      {!compact && (
        <div className={`absolute -inset-3 rounded-full border ${isPeak ? 'border-rose-100' : 'border-emerald-100'} animate-pulse-slow z-0 opacity-50`}></div>
      )}

      {/* Inner Mask for Liquid */}
      <div className="absolute inset-2 rounded-full overflow-hidden bg-white z-10 shadow-lg ring-4 ring-white">
        
        {/* Liquid Container */}
        <div className="relative w-full h-full transform translate-z-0">
            {/* The Wave */}
            <motion.div 
                initial={{ top: '100%' }}
                animate={{ top: `${topPos}%` }}
                transition={{ duration: compact ? 0.8 : 1.5, type: 'spring' }}
                className={`absolute left-[-50%] w-[200%] h-[200%] rounded-[35%] ${compact ? '' : 'liquid-wave'} opacity-90 ${
                    isPeak 
                    ? 'bg-gradient-to-t from-rose-500 via-rose-400 to-orange-300' 
                    : 'bg-gradient-to-t from-emerald-500 via-cyan-400 to-cyan-300'
                }`}
            />
        </div>

        {/* Text Content Overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 drop-shadow-sm">
           <motion.div
             initial={compact ? false : { opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: compact ? 0 : 0.5 }}
             className="text-center"
           >
             <span className={`font-bold tracking-tighter text-slate-800 mix-blend-screen bg-clip-text ${compact ? 'text-3xl' : 'text-5xl'}`}>
                {Math.round(value * 24)}
             </span>
             <div className={`font-bold tracking-widest uppercase text-slate-500 ${compact ? 'text-[8px] mt-[-3px]' : 'text-[10px] mt-[-5px]'}`}>Watts</div>
           </motion.div>
           
           <motion.div
             initial={compact ? false : { opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: compact ? 0 : 0.7 }}
             className={compact ? 'mt-1' : 'mt-3'}
           >
             <span className={`rounded-full font-bold backdrop-blur-md border border-white/20 shadow-sm ${
                isPeak 
                ? 'bg-rose-500/10 text-rose-700' 
                : 'bg-emerald-500/10 text-emerald-700'
             } ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs'}`}>
                {label}
             </span>
           </motion.div>
        </div>
      </div>
      
      {/* Footer Label */}
      <div className={`absolute left-0 right-0 text-center ${compact ? '-bottom-5' : '-bottom-8'}`}>
        <span className={`font-semibold text-slate-400 flex items-center justify-center gap-1 ${compact ? 'text-[9px]' : 'text-xs'}`}>
            <div className={`rounded-full ${isPeak ? 'bg-rose-500' : 'bg-emerald-500'} ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`}></div>
            {subLabel}
        </span>
      </div>
    </div>
  );
};

export default LiquidGauge;