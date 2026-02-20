import React from 'react';
import { motion } from 'framer-motion';

interface LiquidGaugeProps {
  /** Balance remaining as percentage of last recharge (0-100) */
  balancePercent: number;
  /** Balance amount in ₹ to display */
  balanceAmount: number;
  /** Label text shown below the amount (e.g. "Last recharge ₹2000") */
  label: string;
  /** Sub-label shown below gauge (e.g. "Recharged on 29 Dec, 2023") */
  subLabel: string;
  compact?: boolean;
}

/**
 * Returns color scheme based on balance percentage:
 * - 60%+   → green (healthy)
 * - 30-59% → orange (moderate)
 * - <30%   → red (low balance)
 */
const getBalanceColors = (percent: number) => {
  if (percent >= 60) {
    return {
      gradient: 'bg-gradient-to-t from-emerald-500 via-emerald-400 to-cyan-300',
      badge: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', label: 'Healthy' },
      pill: { bg: 'bg-emerald-500/10', text: 'text-emerald-700' },
      ring: 'border-emerald-100',
      dot: 'bg-emerald-500',
    };
  }
  if (percent >= 30) {
    return {
      gradient: 'bg-gradient-to-t from-amber-500 via-amber-400 to-yellow-300',
      badge: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', label: 'Moderate' },
      pill: { bg: 'bg-amber-500/10', text: 'text-amber-700' },
      ring: 'border-amber-100',
      dot: 'bg-amber-500',
    };
  }
  return {
    gradient: 'bg-gradient-to-t from-rose-500 via-rose-400 to-orange-300',
    badge: { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-100', label: 'Low Balance' },
    pill: { bg: 'bg-rose-500/10', text: 'text-rose-700' },
    ring: 'border-rose-100',
    dot: 'bg-rose-500',
  };
};

const LiquidGauge: React.FC<LiquidGaugeProps> = ({
  balancePercent,
  balanceAmount,
  label,
  subLabel,
  compact = false,
}) => {
  // Clamp between 0-100
  const clamped = Math.max(0, Math.min(100, balancePercent));
  // topPos: 0% = full (liquid at top), 100% = empty (liquid at bottom)
  const topPos = 100 - clamped;
  const colors = getBalanceColors(clamped);
  const size = compact ? 'w-36 h-36' : 'w-56 h-56';

  return (
    <div className={`relative ${size} my-2`}>
      {/* Outer Container Ring */}
      <div className="absolute inset-0 rounded-full border border-slate-100 bg-slate-50 shadow-inner z-0"></div>

      {/* Pulsing Ring Indicator - REMOVED for lightweight performance */}
      {/* {!compact && (
        <div className={`absolute -inset-3 rounded-full border ${colors.ring} animate-pulse-slow z-0 opacity-50`}></div>
      )} */}

      {/* Inner Mask for Liquid */}
      <div className="absolute inset-2 rounded-full overflow-hidden bg-white z-10 shadow-lg ring-4 ring-white">

        {/* Liquid Container */}
        <div className="relative w-full h-full transform translate-z-0">
          {/* The Wave - Slower (20s) and no initial fill animation */}
          <motion.div
            animate={{ top: `${topPos}%` }}
            transition={{ duration: 0.5 }} // Short transition only if value changes
            style={{ animationDuration: '20s' }} // Slower wave
            className={`absolute left-[-50%] w-[200%] h-[200%] rounded-[35%] liquid-wave opacity-90 ${colors.gradient}`}
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
            <span className={`font-bold tracking-tighter text-slate-800 ${compact ? 'text-2xl' : 'text-4xl'}`}>
              ₹{Math.round(balanceAmount)}
            </span>
            <div className={`font-bold tracking-widest uppercase text-slate-500 ${compact ? 'text-[8px] mt-[-2px]' : 'text-[10px] mt-[-3px]'}`}>Current Balance</div>
          </motion.div>

          <motion.div
            initial={compact ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: compact ? 0 : 0.7 }}
            className={compact ? 'mt-1' : 'mt-3'}
          >
            <span className={`rounded-full font-bold backdrop-blur-md border border-white/20 shadow-sm ${colors.pill.bg} ${colors.pill.text} ${compact ? 'px-2 py-0.5 text-[9px]' : 'px-3 py-1 text-xs'}`}>
              {label}
            </span>
          </motion.div>
        </div>
      </div>

      {/* Footer Label */}
      <div className={`absolute left-0 right-0 text-center ${compact ? '-bottom-5' : '-bottom-8'}`}>
        <span className={`font-semibold text-slate-400 flex items-center justify-center gap-1 ${compact ? 'text-[9px]' : 'text-xs'}`}>
          <div className={`rounded-full ${colors.dot} ${compact ? 'w-1 h-1' : 'w-1.5 h-1.5'}`}></div>
          {subLabel}
        </span>
      </div>
    </div>
  );
};

export default LiquidGauge;