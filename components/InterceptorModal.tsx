/**
 * InterceptorModal — "Wait! Expensive Time" modal
 *
 * Shown when user tries to turn ON a Tier 1/2/3 appliance during peak.
 * Displays calculated savings options from the math engine.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Zap, Clock, Calendar, Play, Leaf, Timer, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DBAppliance, DBTariffSlot } from '../types/database';
import {
    calculateScheduleOptions,
    calculateCustomOption,
    formatHour,
    getSlotForHour,
    ScheduleOption,
    ECO_MODE_REDUCTION,
} from '../utils/tariffOptimizer';
import { supabase } from '../services/supabase';

interface InterceptorModalProps {
    appliance: DBAppliance;
    slots: DBTariffSlot[];
    currentHour: number;
    homeId: string;
    onClose: () => void;
    onRunNow: () => void;          // Proceed with toggle ON
    onScheduled: () => void;       // After inserting schedule
    onEcoMode?: () => void;        // For Tier 3 only (AC)
}

const DURATION_OPTIONS = [
    { label: '15 min', value: 0.25 },
    { label: '30 min', value: 0.5 },
    { label: '1 hour', value: 1 },
    { label: '2 hours', value: 2 },
    { label: '3 hours', value: 3 },
    { label: 'Custom', value: -1 },
];

const InterceptorModal: React.FC<InterceptorModalProps> = ({
    appliance,
    slots,
    currentHour,
    homeId,
    onClose,
    onRunNow,
    onScheduled,
    onEcoMode,
}) => {
    const [durationHours, setDurationHours] = useState(0.5);
    const [customDurationMin, setCustomDurationMin] = useState(45);
    const [showCustomTime, setShowCustomTime] = useState(false);
    const [customHour, setCustomHour] = useState(() => (currentHour + 2) % 24); // default to 2 hours from now
    const [scheduling, setScheduling] = useState(false);
    const [showDurationDropdown, setShowDurationDropdown] = useState(false);

    // Effective duration for calculations
    const effectiveDuration = durationHours === -1 ? customDurationMin / 60 : durationHours;

    const tier = appliance.optimization_tier || 'tier_4_essential';
    const isTier3 = tier === 'tier_3_comfort';
    const isTier1 = tier === 'tier_1_shiftable';

    // Calculate all options using the math engine
    const options = useMemo(
        () => calculateScheduleOptions(appliance.rated_power_w, effectiveDuration, slots, currentHour),
        [appliance.rated_power_w, effectiveDuration, slots, currentHour]
    );

    const customOption = useMemo(
        () => showCustomTime
            ? calculateCustomOption(appliance.rated_power_w, effectiveDuration, slots, currentHour, customHour)
            : null,
        [showCustomTime, appliance.rated_power_w, effectiveDuration, slots, currentHour, customHour]
    );

    const currentSlot = getSlotForHour(currentHour, slots);
    const currentCostPerHour = (appliance.rated_power_w / 1000) * (currentSlot?.rate || 0);

    // Insert schedule into Supabase (upsert: delete old → insert new)
    const handleSchedule = async (option: ScheduleOption) => {
        setScheduling(true);
        try {
            // Delete any existing active schedules for this appliance
            await supabase
                .from('schedules')
                .delete()
                .eq('appliance_id', appliance.id)
                .eq('is_active', true);

            // Format times as HH:MM (TIME type)
            const startTime = `${String(option.startHour).padStart(2, '0')}:00`;
            const endHourRaw = option.startHour + effectiveDuration;
            const endHour = Math.floor(endHourRaw) % 24;
            const endMinutes = Math.round((endHourRaw % 1) * 60);
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

            // Insert schedule using actual schema columns
            const { error } = await supabase.from('schedules').insert({
                home_id: homeId,
                appliance_id: appliance.id,
                start_time: startTime,
                end_time: endTime,
                repeat_type: 'once',
                is_active: true,
                created_by: 'ai_optimizer',
            });
            if (error) throw error;

            // Update appliance status to SCHEDULED
            await supabase
                .from('appliances')
                .update({ status: 'SCHEDULED', schedule_time: startTime, updated_at: new Date().toISOString() })
                .eq('id', appliance.id);

            onScheduled();
        } catch (err) {
            console.error('Failed to create schedule:', err);
        } finally {
            setScheduling(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
                className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md mb-16 sm:mb-0 max-h-[85vh] overflow-y-auto"
            >
                <div className="p-6 pb-24">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-8 h-8 rounded-xl bg-rose-100 flex items-center justify-center">
                                    <Zap className="w-4 h-4 text-rose-600" />
                                </div>
                                <h2 className="text-lg font-bold text-slate-800">Wait! Expensive Time</h2>
                            </div>
                            <p className="text-sm text-slate-500">
                                Running <span className="font-semibold text-slate-700">{appliance.name}</span> now costs{' '}
                                <span className="font-bold text-rose-600">₹{currentCostPerHour.toFixed(2)}/hr</span>{' '}
                                ({currentSlot?.slot_type || 'peak'} tariff)
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* Duration Selector */}
                    <div className="mb-5">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Duration</label>
                        <div className="relative">
                            <button
                                onClick={() => setShowDurationDropdown(!showDurationDropdown)}
                                className="w-full flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Timer className="w-4 h-4 text-indigo-500" />
                                    <span className="font-semibold text-slate-700">
                                        {durationHours === -1
                                            ? `${customDurationMin} min`
                                            : DURATION_OPTIONS.find(d => d.value === durationHours)?.label || `${durationHours} hours`
                                        }
                                    </span>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showDurationDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence>
                                {showDurationDropdown && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-xl shadow-lg z-10 overflow-hidden"
                                    >
                                        {DURATION_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => { setDurationHours(opt.value); if (opt.value !== -1) setShowDurationDropdown(false); }}
                                                className={`w-full text-left px-4 py-3 text-sm font-medium transition-colors ${durationHours === opt.value
                                                    ? 'bg-indigo-50 text-indigo-600'
                                                    : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                        {/* Custom duration slider */}
                                        {durationHours === -1 && (
                                            <div className="px-4 py-3 border-t border-slate-100">
                                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                                    <span>Custom Duration</span>
                                                    <span className="font-bold text-slate-800">{customDurationMin} min</span>
                                                </div>
                                                <input
                                                    type="range" min="5" max="240" step="5"
                                                    value={customDurationMin}
                                                    onChange={e => setCustomDurationMin(parseInt(e.target.value, 10))}
                                                    className="w-full accent-indigo-500"
                                                />
                                                <div className="flex justify-between text-[10px] text-slate-400">
                                                    <span>5 min</span><span>4 hrs</span>
                                                </div>
                                                <button
                                                    onClick={() => setShowDurationDropdown(false)}
                                                    className="mt-2 w-full py-2 rounded-lg bg-indigo-500 text-white text-xs font-bold"
                                                >
                                                    Set {customDurationMin} min
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Eco Mode (Tier 3 only — AC / Heater) */}
                    {isTier3 && onEcoMode && (
                        <button
                            onClick={onEcoMode}
                            className="w-full mb-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center gap-3 hover:bg-emerald-100 transition-colors group"
                        >
                            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                                <Leaf className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="font-bold text-emerald-700 text-sm">Enable Eco Mode (26°C)</p>
                                <p className="text-xs text-emerald-600">Save ~{Math.round(ECO_MODE_REDUCTION * 100)}% power</p>
                            </div>
                        </button>
                    )}

                    {/* Auto-Off Info (Tier 1 — Geyser) */}
                    {isTier1 && (
                        <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-100 flex items-center gap-2">
                            <Timer className="w-4 h-4 text-amber-600" />
                            <p className="text-xs text-amber-700 font-medium">
                                Auto-off scheduled after {effectiveDuration < 1 ? `${Math.round(effectiveDuration * 60)} min` : `${effectiveDuration}hr`} to prevent waste
                            </p>
                        </div>
                    )}

                    {/* Schedule Options */}
                    <div className="space-y-2 mb-4">
                        {/* Cheapest */}
                        <button
                            onClick={() => handleSchedule(options.cheapest)}
                            disabled={scheduling}
                            className="w-full p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white flex items-center gap-3 hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-200 disabled:opacity-60"
                        >
                            <Zap className="w-5 h-5" />
                            <div className="flex-1 text-left">
                                <p className="font-bold text-sm">{options.cheapest.label}</p>
                                <p className="text-xs opacity-90">
                                    ₹{options.cheapest.costForDuration.toFixed(2)} — Save {options.cheapest.savingsPercent}% (₹{options.cheapest.savingsAmount.toFixed(2)})
                                </p>
                            </div>
                        </button>

                        {/* Next Cheaper (if different from cheapest) */}
                        {options.nextCheaper && (
                            <button
                                onClick={() => handleSchedule(options.nextCheaper!)}
                                disabled={scheduling}
                                className="w-full p-4 rounded-2xl bg-white border-2 border-indigo-100 flex items-center gap-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all disabled:opacity-60"
                            >
                                <Clock className="w-5 h-5 text-indigo-500" />
                                <div className="flex-1 text-left">
                                    <p className="font-bold text-sm text-slate-700">{options.nextCheaper.label}</p>
                                    <p className="text-xs text-slate-500">
                                        ₹{options.nextCheaper.costForDuration.toFixed(2)} — Save {options.nextCheaper.savingsPercent}% (₹{options.nextCheaper.savingsAmount.toFixed(2)})
                                    </p>
                                </div>
                            </button>
                        )}

                        {/* Custom Time */}
                        {!showCustomTime ? (
                            <button
                                onClick={() => setShowCustomTime(true)}
                                className="w-full p-4 rounded-2xl bg-white border-2 border-slate-100 flex items-center gap-3 hover:border-slate-200 hover:bg-slate-50/50 transition-all"
                            >
                                <Calendar className="w-5 h-5 text-slate-400" />
                                <p className="font-bold text-sm text-slate-600">Pick a Custom Time</p>
                            </button>
                        ) : (
                            <div className="p-4 rounded-2xl bg-white border-2 border-indigo-200 space-y-3">
                                <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-indigo-500" />
                                    <p className="font-bold text-sm text-slate-700">Custom Time</p>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {/* Show next 24 hours starting from current hour + 1 */}
                                    {Array.from({ length: 24 }, (_, i) => (currentHour + 1 + i) % 24).map(h => {
                                        const slot = getSlotForHour(h, slots);
                                        const bgColor = slot?.slot_type === 'peak' ? 'bg-rose-100 text-rose-700'
                                            : slot?.slot_type === 'off-peak' ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600';
                                        // Format as AM/PM
                                        const ampm = h >= 12 ? 'PM' : 'AM';
                                        const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
                                        return (
                                            <button
                                                key={h}
                                                onClick={() => setCustomHour(h)}
                                                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${customHour === h
                                                    ? 'ring-2 ring-indigo-500 ring-offset-1'
                                                    : ''
                                                    } ${bgColor}`}
                                            >
                                                {display}{ampm}
                                            </button>
                                        );
                                    })}
                                </div>
                                {customOption && (
                                    <button
                                        onClick={() => handleSchedule(customOption)}
                                        disabled={scheduling}
                                        className="w-full py-3 rounded-xl bg-indigo-500 text-white font-bold text-sm hover:bg-indigo-600 transition-colors disabled:opacity-60"
                                    >
                                        Schedule at {formatHour(customHour)}{' '}
                                        {customOption.savingsAmount > 0 && `— Save ${customOption.savingsPercent}%`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Ignore & Run Now (Red warning) */}
                    <button
                        onClick={onRunNow}
                        className="w-full py-3 text-center text-sm font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                        <div className="flex items-center justify-center gap-1.5">
                            <Play className="w-3 h-3" />
                            Ignore & Run Now (₹{options.runNow.costForDuration.toFixed(2)} for {effectiveDuration < 1 ? `${Math.round(effectiveDuration * 60)}m` : `${effectiveDuration}hr`})
                        </div>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default InterceptorModal;
