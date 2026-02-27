/**
 * Optimizer Screen — Peak Tariff Alert Page
 *
 * Shows all heavy appliances (Tier 1-3) currently ON during peak tariff.
 * Entry point: Home.tsx peak banner → onNavigate('Optimizer')
 *
 * For each appliance, "Fix" opens an action sheet:
 * - Turn Off
 * - Switch to Eco Mode (Tier 3 only)
 * - Schedule → opens InterceptorModal
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Power, PowerOff, Zap, Leaf, Calendar, ChevronRight, Loader2, AlertTriangle, PlayCircle, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';
import { DBAppliance, DBTariffSlot } from '../types/database';
import {
    calculateOptimizationAlert,
    fetchUserTariffSlots,
    formatHour,
    getSlotForHour,
    HeavyAppliance,
    OptimizationAlert,
} from '../utils/tariffOptimizer';
import InterceptorModal from '../components/InterceptorModal';
import ScheduleModal from '../components/ScheduleModal';
import { toggleAppliance as apiToggle, setEcoMode as apiEcoMode, batchTurnOff as apiBatchTurnOff } from '../services/backend';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface OptimizerProps {
    viewMode?: ViewMode;
    onBack?: () => void;
}

// ── Appliance Icon Component ──────────────────────────────────────

function AppIcon({ category }: { category: string }) {
    const icons: Record<string, string> = {
        ac: '❄️', geyser: '🔥', washing_machine: '🧺', refrigerator: '🧊',
        fan: '🌀', tv: '📺', lighting: '💡', other: '⚡',
    };
    return <span className="text-xl">{icons[category] || '⚡'}</span>;
}

// ── Tier Badge ────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
    const config: Record<string, { label: string; color: string }> = {
        tier_1_shiftable: { label: 'Shiftable', color: 'bg-emerald-100 text-emerald-700' },
        tier_2_prep_needed: { label: 'Prep Needed', color: 'bg-amber-100 text-amber-700' },
        tier_3_comfort: { label: 'Comfort', color: 'bg-orange-100 text-orange-700' },
    };
    const c = config[tier] || { label: 'Other', color: 'bg-slate-100 text-slate-500' };
    return <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${c.color}`}>{c.label}</span>;
}

// ── Main Component ────────────────────────────────────────────────

const Optimizer: React.FC<OptimizerProps> = ({ viewMode = 'mobile', onBack }) => {
    const { home } = useApp();

    const [appliances, setAppliances] = useState<DBAppliance[]>([]);
    const [slots, setSlots] = useState<DBTariffSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [turningOffAll, setTurningOffAll] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Action sheet state
    const [actionSheetAppliance, setActionSheetAppliance] = useState<DBAppliance | null>(null);

    // InterceptorModal state (peak only)
    const [interceptAppliance, setInterceptAppliance] = useState<DBAppliance | null>(null);
    // ScheduleModal state (off-peak direct scheduling)
    const [scheduleAppliance, setScheduleAppliance] = useState<DBAppliance | null>(null);

    const currentHour = new Date().getHours();

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!home?.id) return;
        setLoading(true);
        try {
            const [slotsData, { data: appData }] = await Promise.all([
                fetchUserTariffSlots(home.id),
                supabase
                    .from('appliances')
                    .select('*')
                    .eq('home_id', home.id)
                    .eq('is_active', true)
                    .order('rated_power_w', { ascending: false }),
            ]);
            setSlots(slotsData);
            setAppliances(appData || []);
        } catch (err) {
            console.error('Optimizer: fetch failed', err);
        } finally {
            setLoading(false);
        }
    }, [home?.id]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Real-time subscription
    useEffect(() => {
        if (!home?.id) return;
        const channel = supabase
            .channel('optimizer-appliances')
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'appliances',
                filter: `home_id=eq.${home.id}`,
            }, () => fetchData())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [home?.id, fetchData]);

    // Calculate alert from math engine
    const alert: OptimizationAlert = useMemo(
        () => calculateOptimizationAlert(appliances, slots, currentHour),
        [appliances, slots, currentHour]
    );

    // ── Actions ────────────────────────────────────────────────────

    const handleTurnOff = async (applianceId: string) => {
        setActionLoadingId(applianceId);
        try {
            await apiToggle(applianceId, 'turn_off');
            setActionSheetAppliance(null);
            fetchData();
        } catch (err) {
            console.error('Failed to turn off:', err);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleTurnOffAll = async () => {
        setTurningOffAll(true);
        try {
            const ids = alert.heavyAppliancesOn.map(a => a.id);
            await apiBatchTurnOff(ids);
            fetchData();
        } catch (err) {
            console.error('Failed to turn off all:', err);
        } finally {
            setTurningOffAll(false);
        }
    };

    const handleEcoMode = async (applianceId: string) => {
        setActionLoadingId(applianceId);
        try {
            await apiEcoMode(applianceId, true);
            setActionSheetAppliance(null);
            fetchData();
        } catch (err) {
            console.error('Failed to enable eco mode:', err);
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleTurnOn = async (applianceId: string) => {
        setActionLoadingId(applianceId);
        try {
            await apiToggle(applianceId, 'turn_on');
            setActionSheetAppliance(null);
            fetchData();
        } catch (err) {
            console.error('Failed to turn on:', err);
        } finally {
            setActionLoadingId(null);
        }
    };

    // ── Render ──────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
        );
    }

    const currentSlot = getSlotForHour(currentHour, slots);
    const hasHeavyAppliances = alert.heavyAppliancesOn.length > 0;
    const isOffPeak = alert.currentSlotType === 'off-peak';

    return (
        <div className="pb-32 overflow-y-auto h-full no-scrollbar">
            {/* Header */}
            <div className={`px-5 pt-10 pb-6 ${alert.isCurrentlyPeak ? 'bg-gradient-to-b from-rose-50 to-white' : isOffPeak ? 'bg-gradient-to-b from-emerald-50 to-white' : 'bg-gradient-to-b from-slate-50 to-white'}`}>
                <div className="flex items-center gap-3 mb-4">
                    {onBack && (
                        <button onClick={onBack} className="p-2 rounded-xl bg-white/80 border border-slate-100 hover:bg-slate-50 transition-colors">
                            <ArrowLeft className="w-5 h-5 text-slate-600" />
                        </button>
                    )}
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">
                            {alert.isCurrentlyPeak ? '⚡ Peak Tariff Active' : isOffPeak ? '✅ Off-Peak' : '📊 Normal Tariff'}
                        </h1>
                        <p className="text-sm text-slate-500">
                            Current rate: ₹{alert.currentRate.toFixed(2)}/kWh ({currentSlot?.slot_type || '—'})
                        </p>
                    </div>
                </div>

                {/* Context-aware messaging */}
                {alert.isCurrentlyPeak ? (
                    // PEAK: warn about heavy appliances running
                    hasHeavyAppliances ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white p-4 rounded-2xl shadow-soft border border-rose-100"
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <p className="text-sm font-bold text-rose-600">
                                        ⚠️ {alert.heavyAppliancesOn.length} heavy appliance{alert.heavyAppliancesOn.length > 1 ? 's' : ''} running at peak rate
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        Possible savings: <span className="font-bold text-emerald-600">₹{alert.totalSavingsPerHour.toFixed(2)}/hr</span>
                                    </p>
                                </div>
                                <button
                                    onClick={handleTurnOffAll}
                                    disabled={turningOffAll}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200 disabled:opacity-60"
                                >
                                    {turningOffAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <PowerOff className="w-3 h-3" />}
                                    Turn Off All
                                </button>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="bg-white p-4 rounded-2xl shadow-soft border border-emerald-100 text-center">
                            <p className="text-sm font-semibold text-emerald-600">👍 Good — no heavy appliances during peak tariff</p>
                            <p className="text-xs text-slate-400 mt-1">You're saving money by not running heavy loads now</p>
                        </div>
                    )
                ) : isOffPeak ? (
                    // OFF-PEAK: encourage running heavy appliances
                    hasHeavyAppliances ? (
                        <div className="bg-white p-4 rounded-2xl shadow-soft border border-emerald-100 text-center">
                            <p className="text-sm font-semibold text-emerald-600">✅ Smart! Running heavy appliances at off-peak rate</p>
                            <p className="text-xs text-slate-400 mt-1">₹{alert.currentRate.toFixed(2)}/kWh — this is the cheapest time to run loads</p>
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-2xl shadow-soft border border-amber-100 text-center">
                            <p className="text-sm font-semibold text-amber-600">💡 This is the cheapest time to run heavy appliances!</p>
                            <p className="text-xs text-slate-400 mt-1">Turn on your washing machine, EV charger, geyser etc. now at ₹{alert.currentRate.toFixed(2)}/kWh</p>
                        </div>
                    )
                ) : (
                    // NORMAL: neutral state
                    <div className="bg-white p-4 rounded-2xl shadow-soft border border-slate-100 text-center">
                        <p className="text-sm font-semibold text-slate-600">Standard rate active</p>
                        <p className="text-xs text-slate-400 mt-1">₹{alert.currentRate.toFixed(2)}/kWh — wait for off-peak to save more on heavy loads</p>
                    </div>
                )}
            </div>

            {/* Appliance List */}
            <div className="px-5 space-y-3 mt-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">
                    {alert.isCurrentlyPeak && hasHeavyAppliances ? 'Running Heavy Appliances' : 'All Appliances'}
                </h3>

                {/* During peak: show heavy appliances with Fix button */}
                {alert.isCurrentlyPeak && alert.heavyAppliancesOn.map((a, i) => {
                    const fullAppliance = appliances.find(ap => ap.id === a.id);
                    if (!fullAppliance) return null;

                    return (
                        <motion.div
                            key={a.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-white rounded-2xl p-4 shadow-soft border border-slate-100 flex items-center gap-4"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center">
                                <AppIcon category={a.category} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <p className="font-bold text-slate-800 text-sm truncate">{a.name}</p>
                                    <TierBadge tier={a.optimization_tier} />
                                </div>
                                <p className="text-xs text-slate-400">
                                    {a.rated_power_w}W • <span className="text-rose-500 font-semibold">₹{a.costPerHour.toFixed(2)}/hr</span>
                                    {a.eco_mode_enabled && <span className="text-emerald-500 ml-1">• 🌿 Eco</span>}
                                </p>
                            </div>
                            <button
                                onClick={() => setActionSheetAppliance(fullAppliance)}
                                className="px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs hover:bg-indigo-100 transition-colors flex items-center gap-1"
                            >
                                Fix <ChevronRight className="w-3 h-3" />
                            </button>
                        </motion.div>
                    );
                })}

                {/* Peak: show eco-active appliances as "Already Optimized" */}
                {alert.isCurrentlyPeak && alert.heavyAppliancesEcoActive.length > 0 && (
                    <>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mt-6">Already Optimized</h3>
                        {alert.heavyAppliancesEcoActive.map((a, i) => (
                            <motion.div
                                key={a.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="bg-white rounded-2xl p-4 shadow-soft border border-emerald-100 flex items-center gap-4"
                            >
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                                    <AppIcon category={a.category} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="font-bold text-slate-800 text-sm truncate">{a.name}</p>
                                        <TierBadge tier={a.optimization_tier} />
                                    </div>
                                    <p className="text-xs text-slate-400">
                                        {a.rated_power_w}W • <span className="text-emerald-600 font-semibold">₹{a.costPerHour.toFixed(2)}/hr</span>
                                        <span className="text-emerald-500 ml-1">• 🌿 Eco Mode Active</span>
                                    </p>
                                </div>
                                <div className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-600 font-bold text-xs flex items-center gap-1">
                                    <Check className="w-3 h-3" /> OK
                                </div>
                            </motion.div>
                        ))}
                    </>
                )}

                {/* Off-peak ONLY: show heavy OFF appliances as suggestions to turn on */}
                {isOffPeak && alert.heavyAppliancesOff.length > 0 && (
                    <>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mt-6">
                            💡 Suggested — Run Now at Low Rate
                        </h3>
                        <p className="text-xs text-slate-400 px-1 mb-2">
                            These heavy appliances are OFF. Run them now at ₹{alert.currentRate.toFixed(2)}/kWh to save money.
                        </p>
                        {alert.heavyAppliancesOff.map((a, i) => {
                            const fullAppliance = appliances.find(ap => ap.id === a.id);
                            if (!fullAppliance) return null;
                            const costIfRunNow = (a.rated_power_w / 1000) * alert.currentRate;

                            return (
                                <motion.div
                                    key={a.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="bg-white rounded-2xl p-4 shadow-soft border border-emerald-100 flex items-center gap-4"
                                >
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-50/50 flex items-center justify-center">
                                        <AppIcon category={a.category} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <p className="font-bold text-slate-800 text-sm truncate">{a.name}</p>
                                            <TierBadge tier={a.optimization_tier} />
                                        </div>
                                        <p className="text-xs text-slate-400">
                                            {a.rated_power_w}W • <span className="text-emerald-600 font-semibold">₹{costIfRunNow.toFixed(2)}/hr</span>
                                            <span className="text-slate-300 ml-1">• Currently OFF</span>
                                        </p>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={() => handleTurnOn(fullAppliance.id)}
                                            disabled={actionLoadingId === fullAppliance.id}
                                            className="px-3 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs hover:bg-emerald-600 transition-colors flex items-center gap-1 shadow-sm disabled:opacity-60"
                                        >
                                            {actionLoadingId === fullAppliance.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                                            Run
                                        </button>
                                        <button
                                            onClick={() => {
                                                setScheduleAppliance(fullAppliance);
                                            }}
                                            className="px-2.5 py-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold text-xs hover:bg-indigo-100 transition-colors"
                                        >
                                            <Calendar className="w-3 h-3" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </>
                )}
            </div>

            {/* Tariff Timeline */}
            <div className="px-5 mt-8">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 mb-3">Today's Tariff Slots</h3>
                <div className="space-y-2">
                    {slots.map(slot => {
                        const isCurrent = currentSlot?.id === slot.id;
                        const colors: Record<string, string> = {
                            'peak': 'border-rose-200 bg-rose-50',
                            'off-peak': 'border-emerald-200 bg-emerald-50',
                            'normal': 'border-slate-200 bg-slate-50',
                        };
                        const textColors: Record<string, string> = {
                            'peak': 'text-rose-600',
                            'off-peak': 'text-emerald-600',
                            'normal': 'text-slate-600',
                        };
                        return (
                            <div
                                key={slot.id}
                                className={`p-3 rounded-xl border flex items-center justify-between ${isCurrent ? `${colors[slot.slot_type]} ring-2 ring-indigo-300` : `${colors[slot.slot_type]} opacity-60`
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {isCurrent && <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />}
                                    <p className="text-xs font-bold text-slate-700">{slot.hour_label}</p>
                                </div>
                                <p className={`text-xs font-bold ${textColors[slot.slot_type]}`}>₹{slot.rate}/kWh</p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Action Sheet */}
            <AnimatePresence>
                {actionSheetAppliance && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
                        onClick={() => setActionSheetAppliance(null)}
                    >
                        <motion.div
                            initial={{ y: 200 }}
                            animate={{ y: 0 }}
                            exit={{ y: 200 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-t-3xl w-full max-w-md"
                        >
                            <div className="p-6 space-y-2">
                                <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
                                <p className="text-lg font-bold text-slate-800 mb-1">{actionSheetAppliance.name}</p>
                                <p className="text-sm text-slate-500 mb-4">
                                    {actionSheetAppliance.rated_power_w}W • {actionSheetAppliance.category}
                                </p>

                                {/* Turn Off */}
                                <button
                                    onClick={() => handleTurnOff(actionSheetAppliance.id)}
                                    disabled={actionLoadingId === actionSheetAppliance.id}
                                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-colors disabled:opacity-60"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                                        <PowerOff className="w-5 h-5 text-rose-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-rose-700 text-sm">Turn Off Now</p>
                                        <p className="text-xs text-rose-500">Stop consuming immediately</p>
                                    </div>
                                </button>

                                {/* Eco Mode (Tier 3 only, not already enabled) */}
                                {actionSheetAppliance.optimization_tier === 'tier_3_comfort' && !actionSheetAppliance.eco_mode_enabled && (
                                    <button
                                        onClick={() => handleEcoMode(actionSheetAppliance.id)}
                                        disabled={actionLoadingId === actionSheetAppliance.id}
                                        className="w-full flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 hover:bg-emerald-100 transition-colors disabled:opacity-60"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <Leaf className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-emerald-700 text-sm">Enable Eco Mode (26°C)</p>
                                            <p className="text-xs text-emerald-500">Save ~15% power consumption</p>
                                        </div>
                                    </button>
                                )}
                                {actionSheetAppliance.optimization_tier === 'tier_3_comfort' && actionSheetAppliance.eco_mode_enabled && (
                                    <div className="w-full flex items-center gap-3 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                                            <Check className="w-5 h-5 text-emerald-600" />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-emerald-700 text-sm">Eco Mode Already Active</p>
                                            <p className="text-xs text-emerald-500">Running at reduced power (−15%)</p>
                                        </div>
                                    </div>
                                )}

                                {/* Schedule */}
                                <button
                                    onClick={() => {
                                        setActionSheetAppliance(null);
                                        setInterceptAppliance(actionSheetAppliance);
                                    }}
                                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                                        <Calendar className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-indigo-700 text-sm">Schedule for Cheaper Time</p>
                                        <p className="text-xs text-indigo-500">Pick optimal slot with savings preview</p>
                                    </div>
                                </button>

                                {/* Cancel */}
                                <button
                                    onClick={() => setActionSheetAppliance(null)}
                                    className="w-full py-3 text-center text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors mt-2"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* InterceptorModal — only shown during peak from action sheet */}
            <AnimatePresence>
                {interceptAppliance && home && (
                    <InterceptorModal
                        appliance={interceptAppliance}
                        slots={slots}
                        currentHour={currentHour}
                        homeId={home.id}
                        onClose={() => setInterceptAppliance(null)}
                        onRunNow={() => {
                            setInterceptAppliance(null);
                        }}
                        onScheduled={() => {
                            setInterceptAppliance(null);
                            fetchData();
                        }}
                        onEcoMode={
                            interceptAppliance.optimization_tier === 'tier_3_comfort'
                                ? () => {
                                    handleEcoMode(interceptAppliance.id);
                                    setInterceptAppliance(null);
                                }
                                : undefined
                        }
                    />
                )}
            </AnimatePresence>

            {/* ScheduleModal — direct schedule picker (off-peak suggestions) */}
            <AnimatePresence>
                {scheduleAppliance && home && (
                    <ScheduleModal
                        homeId={home.id}
                        appliance={scheduleAppliance}
                        tariffSlots={slots}
                        onClose={() => setScheduleAppliance(null)}
                        onSaved={() => {
                            setScheduleAppliance(null);
                            fetchData();
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Optimizer;
