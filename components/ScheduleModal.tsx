/**
 * ScheduleModal — Time-picker with real-time tariff cost preview
 *
 * Extracted from Control.tsx so both Control and Optimizer can use it.
 * Features:
 * - 12-hour clock picker (1-12 + AM/PM)
 * - Minute wheel (0-59)
 * - Duration presets (15m, 30m, 1h, 2h, custom, let-it-run)
 * - Real-time cost calculation at selected time
 * - Peak warning + cheapest-slot suggestion
 */

import React, { useState } from 'react';
import { X, Check, Calendar, Loader2, AlertCircle, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { DBAppliance, DBTariffSlot } from '../types/database';
import { supabase } from '../services/supabase';
import { calculateCostForTime, getSlotForHour, formatHour } from '../utils/tariffOptimizer';
import { createSchedule as apiCreateSchedule } from '../services/backend';

interface ScheduleModalProps {
    homeId: string;
    appliance: DBAppliance;
    tariffSlots: DBTariffSlot[];
    onClose: () => void;
    onSaved: () => void;
}

const DURATION_OPTIONS = [
    { label: '15 min', value: 0.25 },
    { label: '30 min', value: 0.5 },
    { label: '1 hr', value: 1 },
    { label: '2 hr', value: 2 },
    { label: 'Custom', value: -1 },
    { label: 'Let it run', value: 0 },
];

const ScheduleModal: React.FC<ScheduleModalProps> = ({ homeId, appliance, tariffSlots, onClose, onSaved }) => {
    const [hour12, setHour12] = useState(10);
    const [minute, setMinute] = useState(0);
    const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
    const [durationValue, setDurationValue] = useState(1);
    const [customMinutes, setCustomMinutes] = useState(45);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const to24h = (h12: number, m: number, period: 'AM' | 'PM'): string => {
        let h24 = h12 % 12;
        if (period === 'PM') h24 += 12;
        return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    const time = to24h(hour12, minute, ampm);
    const displayTime = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
    const effectiveDuration = durationValue === -1 ? customMinutes / 60 : durationValue;

    const selectedHour = parseInt(time.split(':')[0], 10);
    const selectedSlot = tariffSlots.length > 0 ? getSlotForHour(selectedHour, tariffSlots) : null;
    const isPeak = selectedSlot?.slot_type === 'peak';

    const costNow = tariffSlots.length > 0 && effectiveDuration > 0
        ? calculateCostForTime(appliance.rated_power_w, selectedHour, effectiveDuration, tariffSlots, minute)
        : 0;

    const cheapestSlot = tariffSlots.length > 0
        ? [...tariffSlots].sort((a, b) => a.rate - b.rate)[0]
        : null;
    const cheapestCost = cheapestSlot && effectiveDuration > 0
        ? calculateCostForTime(appliance.rated_power_w, cheapestSlot.start_hour, effectiveDuration, tariffSlots)
        : 0;
    const savings = costNow - cheapestCost;

    const handleSave = async () => {
        setSaving(true); setError('');
        try {
            let endTime: string | null = null;
            if (effectiveDuration > 0) {
                const [hStr, mStr] = time.split(':');
                const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + Math.round(effectiveDuration * 60);
                const endH = Math.floor(totalMinutes / 60) % 24;
                const endM = totalMinutes % 60;
                endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
            }

            // Backend handles: deactivate old schedules, insert new, update appliance status, register APScheduler jobs
            await apiCreateSchedule(appliance.id, time, endTime, 'once');

            onSaved();
        } catch (err: any) { setError(err.message || 'Failed to create schedule'); }
        finally { setSaving(false); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md mb-20 sm:mb-0 max-h-[85vh] overflow-y-auto">
                <div className="p-6">
                    <div className="flex justify-between items-center mb-5">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Schedule</h2>
                            <span className="text-sm text-slate-400">{appliance.name} • {appliance.rated_power_w}W</span>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {/* AM/PM Time Picker */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Start Time</label>
                            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">Hour</label>
                                    <div className="grid grid-cols-4 gap-1">
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                                            <button key={h} onClick={() => setHour12(h)}
                                                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${hour12 === h ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                                            >{h}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="w-16">
                                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">Min</label>
                                    <div className="flex flex-col gap-0.5 h-[140px] overflow-y-auto snap-y snap-mandatory scrollbar-thin">
                                        {Array.from({ length: 60 }, (_, m) => (
                                            <button key={m} onClick={() => setMinute(m)}
                                                className={`py-1 rounded-lg text-xs font-bold transition-all flex-shrink-0 snap-center ${minute === m ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                                            >{String(m).padStart(2, '0')}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="w-14">
                                    <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">&nbsp;</label>
                                    <div className="flex flex-col gap-1">
                                        <button onClick={() => setAmpm('AM')}
                                            className={`py-2.5 rounded-lg text-xs font-bold transition-all ${ampm === 'AM' ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                                        >AM</button>
                                        <button onClick={() => setAmpm('PM')}
                                            className={`py-2.5 rounded-lg text-xs font-bold transition-all ${ampm === 'PM' ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                                        >PM</button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-lg font-bold text-slate-800">{displayTime}</span>
                                {tariffSlots.length > 0 && (
                                    <div className={`text-xs flex items-center gap-1 ${isPeak ? 'text-rose-500' : 'text-emerald-600'}`}>
                                        <span className={`w-2 h-2 rounded-full ${isPeak ? 'bg-rose-400' : 'bg-emerald-400'}`} />
                                        {selectedSlot?.slot_type} — ₹{selectedSlot?.rate}/kWh
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Duration Picker */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Run for</label>
                            <div className="grid grid-cols-3 gap-2">
                                {DURATION_OPTIONS.map(opt => (
                                    <button key={opt.label} onClick={() => setDurationValue(opt.value)}
                                        className={`py-2.5 rounded-xl text-xs font-bold transition-all ${durationValue === opt.value
                                            ? (opt.value === 0 ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white')
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                    >{opt.label}</button>
                                ))}
                            </div>
                            {durationValue === -1 && (
                                <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                                        <span>Custom Duration</span>
                                        <span className="font-bold text-slate-800">{customMinutes} min</span>
                                    </div>
                                    <input type="range" min="5" max="240" step="5" value={customMinutes}
                                        onChange={e => setCustomMinutes(parseInt(e.target.value, 10))} className="w-full accent-indigo-500" />
                                    <div className="flex justify-between text-[10px] text-slate-400"><span>5 min</span><span>4 hrs</span></div>
                                </div>
                            )}
                            {durationValue === 0 && (
                                <div className="mt-2 text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-start gap-1.5">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    <span>Appliance will stay ON until you manually turn it off. No auto-off.</span>
                                </div>
                            )}
                        </div>

                        {/* Cost Comparison */}
                        {tariffSlots.length > 0 && effectiveDuration > 0 && (
                            <div className={`p-4 rounded-2xl border ${isPeak ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-slate-600">Cost at {displayTime}</span>
                                    <span className={`text-sm font-bold ${isPeak ? 'text-rose-600' : 'text-emerald-600'}`}>₹{costNow.toFixed(2)}</span>
                                </div>
                                {isPeak && cheapestSlot && savings > 0.01 && (
                                    <>
                                        <div className="h-px bg-slate-200 my-2" />
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs text-slate-500">Cheapest at {formatHour(cheapestSlot.start_hour)} ({cheapestSlot.slot_type})</span>
                                            <span className="text-sm font-bold text-emerald-600">₹{cheapestCost.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-2">
                                            <Zap className="w-3.5 h-3.5 text-amber-500" />
                                            <span className="text-xs font-bold text-amber-600">
                                                You'd save ₹{savings.toFixed(2)} ({Math.round((savings / costNow) * 100)}%) by shifting
                                            </span>
                                        </div>
                                        <button onClick={() => {
                                            const cheapHour = cheapestSlot.start_hour;
                                            const newAmpm = cheapHour >= 12 ? 'PM' : 'AM';
                                            const newH12 = cheapHour === 0 ? 12 : cheapHour > 12 ? cheapHour - 12 : cheapHour;
                                            setHour12(newH12);
                                            setMinute(0);
                                            setAmpm(newAmpm as 'AM' | 'PM');
                                        }}
                                            className="mt-3 w-full py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5"
                                        >
                                            <Calendar className="w-3.5 h-3.5" /> Switch to {formatHour(cheapestSlot.start_hour)}
                                        </button>
                                    </>
                                )}
                                {!isPeak && (
                                    <div className="flex items-center gap-1.5">
                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        <span className="text-xs font-medium text-emerald-700">Great choice — this is a low-rate window!</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {error && (
                            <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 p-3 rounded-xl">
                                <AlertCircle className="w-4 h-4" /> {error}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Set Schedule
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ScheduleModal;
