import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Zap, Activity, Gauge, Clock, TrendingUp, Power, RefreshCw, Wifi, WifiOff, BarChart3, Battery } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPlugStatus, getPlugReadings, controlPlug, PlugStatusData, PlugReadingsData } from '../services/backend';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  plugId: string;
  plugName: string;
  linkedAppliance?: string;
  onBack: () => void;
  viewMode?: ViewMode;
}

const SmartPlugDetail: React.FC<Props> = ({
  plugId,
  plugName,
  linkedAppliance,
  onBack,
  viewMode = 'mobile',
}) => {
  const [status, setStatus] = useState<PlugStatusData | null>(null);
  const [readings, setReadings] = useState<PlugReadingsData | null>(null);
  const [period, setPeriod] = useState<'1h' | '6h' | '24h' | '7d' | '30d'>('24h');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  // ── Fetch live status ──
  const fetchStatus = useCallback(async () => {
    try {
      const s = await getPlugStatus(plugId);
      setStatus(s);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Failed to fetch status');
    }
  }, [plugId]);

  // ── Fetch historical readings ──
  const fetchReadings = useCallback(async () => {
    try {
      const r = await getPlugReadings(plugId, period);
      setReadings(r);
    } catch (e: any) {
      console.error('Failed to fetch readings:', e);
    }
  }, [plugId, period]);

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchReadings()]);
      setLoading(false);
    })();
  }, [fetchStatus, fetchReadings]);

  // ── Auto-refresh status every 10s ──
  useEffect(() => {
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // ── Refresh readings when period changes ──
  useEffect(() => {
    fetchReadings();
  }, [period, fetchReadings]);

  // ── Manual refresh ──
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStatus(), fetchReadings()]);
    setRefreshing(false);
  };

  // ── Toggle plug on/off ──
  const handleToggle = async () => {
    if (!status) return;
    setToggling(true);
    try {
      const action = status.is_on ? 'turn_off' : 'turn_on';
      await controlPlug(plugId, action);
      await fetchStatus();
    } catch (e: any) {
      setError(e.message || 'Control failed');
    } finally {
      setToggling(false);
    }
  };

  // ── Power bar chart from readings ──
  const chartData = readings?.readings
    ? (() => {
        const points = readings.readings;
        // Downsample to ~30 bars max
        const step = Math.max(1, Math.floor(points.length / 30));
        const bars: { time: string; watts: number }[] = [];
        for (let i = 0; i < points.length; i += step) {
          const slice = points.slice(i, i + step);
          const avgW = slice.reduce((s, p) => s + (p.power_w || 0), 0) / slice.length;
          const t = new Date(slice[0].timestamp);
          bars.push({
            time: t.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            watts: Math.round(avgW * 10) / 10,
          });
        }
        return bars;
      })()
    : [];

  const maxWatts = chartData.length > 0 ? Math.max(...chartData.map(d => d.watts), 1) : 1;

  // ── Estimated cost (₹8/kWh default Indian rate) ──
  const RATE_PER_KWH = 8;
  const estimatedCost = readings?.summary
    ? Math.round(readings.summary.total_energy_kwh * RATE_PER_KWH * 100) / 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  const s = status;
  const summary = readings?.summary;

  return (
    <div className={`pb-32 overflow-y-auto h-full no-scrollbar bg-slate-50 ${isCompact ? 'pt-6 px-6' : 'pt-8 px-5'}`}>

      {/* ── Header ── */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition-transform ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
        >
          <ArrowLeft className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        <div className="flex-1">
          <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>{plugName}</h1>
          <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
            {linkedAppliance ? `→ ${linkedAppliance}` : 'Smart Plug Monitor'}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-400 hover:text-slate-600 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'} ${refreshing ? 'animate-spin' : ''}`}
        >
          <RefreshCw className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
      </div>

      {/* ── Online/Offline + Power Toggle ── */}
      <div className={`bg-white shadow-soft border border-slate-100 mb-5 relative overflow-hidden ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
        {/* Decorative corner */}
        <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-[3rem] -z-0 ${s?.is_online ? 'bg-cyan-50' : 'bg-slate-100'}`} />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {s?.is_online ? (
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Wifi className="w-5 h-5" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
                  <WifiOff className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${s?.is_online ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {s?.is_online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  {s?.is_online && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">
                  via {s?.source || 'unknown'} • {s?.last_seen_at ? `${new Date(s.last_seen_at).toLocaleTimeString()}` : 'never'}
                </p>
              </div>
            </div>

            {/* Power Toggle Button */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleToggle}
              disabled={toggling || !s?.is_online}
              className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
                s?.is_on
                  ? 'bg-cyan-500 text-white shadow-cyan-200'
                  : 'bg-slate-200 text-slate-400'
              } ${toggling ? 'animate-pulse' : ''} disabled:opacity-50`}
            >
              <Power className="w-6 h-6" />
            </motion.button>
          </div>

          {/* Big Power Reading */}
          <div className="text-center py-4">
            <motion.div
              key={s?.power_w}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`font-extrabold tracking-tight ${isCompact ? 'text-5xl' : 'text-6xl'} ${s?.is_on ? 'text-slate-800' : 'text-slate-300'}`}
            >
              {s?.power_w != null ? (
                s.power_w >= 1000
                  ? `${(s.power_w / 1000).toFixed(2)}`
                  : `${s.power_w.toFixed(1)}`
              ) : '—'}
            </motion.div>
            <p className={`font-bold text-slate-400 uppercase tracking-widest mt-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
              {s?.power_w != null && s.power_w >= 1000 ? 'Kilowatts' : 'Watts'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Live Stats Grid ── */}
      <div className={`grid grid-cols-2 gap-3 mb-5`}>
        {/* Voltage */}
        <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <span className={`text-slate-400 font-bold uppercase tracking-wider ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>Voltage</span>
          </div>
          <p className={`font-extrabold text-slate-800 ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
            {s?.voltage?.toFixed(1) || '—'}<span className="text-sm font-bold text-slate-400 ml-1">V</span>
          </p>
          <p className={`text-slate-400 font-medium mt-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            {s?.voltage ? (s.voltage >= 220 && s.voltage <= 240 ? '✅ Normal range' : '⚠️ Fluctuation detected') : '—'}
          </p>
        </div>

        {/* Current */}
        <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <span className={`text-slate-400 font-bold uppercase tracking-wider ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>Current</span>
          </div>
          <p className={`font-extrabold text-slate-800 ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
            {s?.current_ma != null ? (
              s.current_ma >= 1000
                ? `${(s.current_ma / 1000).toFixed(2)}`
                : `${Math.round(s.current_ma)}`
            ) : '—'}
            <span className="text-sm font-bold text-slate-400 ml-1">
              {s?.current_ma != null && s.current_ma >= 1000 ? 'A' : 'mA'}
            </span>
          </p>
          <p className={`text-slate-400 font-medium mt-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            {s?.current_ma ? (s.current_ma <= 16000 ? '✅ Within 16A limit' : '🔴 Over limit!') : '—'}
          </p>
        </div>

        {/* Energy Consumed */}
        <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-500 flex items-center justify-center">
              <Battery className="w-4 h-4" />
            </div>
            <span className={`text-slate-400 font-bold uppercase tracking-wider ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>Energy</span>
          </div>
          <p className={`font-extrabold text-slate-800 ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
            {s?.energy_kwh?.toFixed(2) || '—'}<span className="text-sm font-bold text-slate-400 ml-1">kWh</span>
          </p>
          <p className={`text-slate-400 font-medium mt-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            Cumulative total
          </p>
        </div>

        {/* Estimated Cost */}
        <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className={`text-slate-400 font-bold uppercase tracking-wider ${isCompact ? 'text-[8px]' : 'text-[9px]'}`}>Cost</span>
          </div>
          <p className={`font-extrabold text-slate-800 ${isCompact ? 'text-2xl' : 'text-3xl'}`}>
            ₹{estimatedCost > 0 ? estimatedCost.toFixed(1) : '—'}
          </p>
          <p className={`text-slate-400 font-medium mt-1 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            Estimated @ ₹{RATE_PER_KWH}/kWh
          </p>
        </div>
      </div>

      {/* ── Historical Summary ── */}
      {summary && (
        <div className={`bg-white shadow-soft border border-slate-100 mb-5 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className={`text-cyan-500 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
              <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Power History</h3>
            </div>
            {/* Period Tabs */}
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {(['1h', '6h', '24h', '7d', '30d'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-1 rounded-md font-bold transition-all ${
                    period === p
                      ? 'bg-white text-cyan-600 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  } ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Summary Stats Row */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Avg', value: `${summary.avg_power_w}W`, color: 'text-cyan-600' },
              { label: 'Peak', value: `${summary.max_power_w}W`, color: 'text-rose-500' },
              { label: 'Min', value: `${summary.min_power_w}W`, color: 'text-emerald-500' },
              { label: 'Uptime', value: `${summary.uptime_percent}%`, color: 'text-indigo-500' },
            ].map(stat => (
              <div key={stat.label} className="text-center bg-slate-50 rounded-xl py-2">
                <p className={`font-extrabold ${stat.color} ${isCompact ? 'text-sm' : 'text-base'}`}>{stat.value}</p>
                <p className={`text-slate-400 font-bold uppercase tracking-wider ${isCompact ? 'text-[7px]' : 'text-[8px]'}`}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Mini Bar Chart */}
          {chartData.length > 0 && (
            <div>
              <div className="flex items-end gap-[2px] h-24">
                {chartData.map((bar, idx) => {
                  const heightPct = (bar.watts / maxWatts) * 100;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ height: 0 }}
                      animate={{ height: `${heightPct}%` }}
                      transition={{ delay: idx * 0.02, duration: 0.3 }}
                      className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500 to-cyan-300 hover:from-cyan-600 hover:to-cyan-400 transition-colors cursor-pointer relative group min-w-[3px]"
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-800 text-white text-[8px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {bar.watts}W
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {/* X-axis labels */}
              <div className="flex justify-between mt-1">
                <span className={`text-slate-400 ${isCompact ? 'text-[7px]' : 'text-[8px]'}`}>
                  {chartData[0]?.time}
                </span>
                <span className={`text-slate-400 ${isCompact ? 'text-[7px]' : 'text-[8px]'}`}>
                  {chartData[chartData.length - 1]?.time}
                </span>
              </div>
            </div>
          )}

          {chartData.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400 text-xs font-medium">No readings yet for this period</p>
              <p className="text-slate-300 text-[10px] mt-1">Data appears after the plug has been polling</p>
            </div>
          )}

          {/* Readings count */}
          <p className={`text-slate-400 font-medium text-center mt-3 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
            {summary.reading_count} readings • {summary.total_energy_kwh.toFixed(4)} kWh consumed
          </p>
        </div>
      )}

      {/* ── Uptime Card ── */}
      {summary && (
        <div className={`bg-white shadow-soft border border-slate-100 mb-5 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Clock className={`text-indigo-500 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Uptime</h3>
          </div>

          {/* Uptime Bar */}
          <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${summary.uptime_percent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
              Device was active for <strong>{summary.uptime_percent}%</strong> of the selected period
            </span>
            <span className={`font-bold text-indigo-600 ${isCompact ? 'text-xs' : 'text-sm'}`}>
              {summary.uptime_percent}%
            </span>
          </div>
        </div>
      )}

      {/* ── Device Info ── */}
      <div className={`bg-white shadow-soft border border-slate-100 mb-5 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
        <h3 className={`font-bold text-slate-800 mb-3 ${isCompact ? 'text-sm' : 'text-base'}`}>Device Info</h3>
        <div className="space-y-2">
          {[
            { label: 'Device ID', value: s?.tuya_device_id || '—' },
            { label: 'Connection', value: s?.source === 'lan' ? 'LAN (Local)' : s?.source === 'cloud' ? 'Cloud API' : s?.source || '—' },
            { label: 'Linked To', value: linkedAppliance || 'Not linked' },
            { label: 'Last Seen', value: s?.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : 'Never' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
              <span className={`text-slate-400 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{row.label}</span>
              <span className={`text-slate-700 font-semibold text-right max-w-[60%] truncate ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className={`bg-rose-50 border border-rose-100 flex items-center gap-2 mb-5 ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
          <Zap className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <p className={`text-rose-700 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{error}</p>
        </div>
      )}
    </div>
  );
};

export default SmartPlugDetail;
