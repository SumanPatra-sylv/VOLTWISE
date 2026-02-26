import React, { useState, useEffect, useCallback } from 'react';
import {
  Power, Bot, Sliders, Settings2, Zap, Plus, Trash2, Clock, Wifi, WifiOff,
  X, Check, ChevronDown, AlertCircle, Calendar, Loader2, Edit2, ToggleRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';
import { DBAppliance, DBTariffSlot, ApplianceCategory } from '../types/database';
import InterceptorModal from '../components/InterceptorModal';
import { shouldIntercept, fetchUserTariffSlots, calculateCostForTime, getSlotForHour, formatHour } from '../utils/tariffOptimizer';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface ControlProps {
  viewMode?: ViewMode;
}

interface Schedule {
  id: string;
  appliance_id: string;
  home_id: string;
  start_time: string;
  end_time: string | null;
  repeat_type: 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';
  custom_days: number[] | null;
  is_active: boolean;
  created_by: string;
}

const CATEGORY_OPTIONS: { value: ApplianceCategory; label: string; icon: string }[] = [
  { value: 'ac', label: 'Air Conditioner', icon: 'wind' },
  { value: 'geyser', label: 'Geyser/Water Heater', icon: 'thermometer' },
  { value: 'refrigerator', label: 'Refrigerator', icon: 'box' },
  { value: 'washing_machine', label: 'Washing Machine', icon: 'disc' },
  { value: 'fan', label: 'Fan', icon: 'wind' },
  { value: 'tv', label: 'Television', icon: 'tv' },
  { value: 'lighting', label: 'Lighting', icon: 'lightbulb' },
  { value: 'other', label: 'Other', icon: 'zap' },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Control: React.FC<ControlProps> = ({ viewMode = 'mobile' }) => {
  const { home } = useApp();
  const [autoMode, setAutoMode] = useState(true);
  const [appliances, setAppliances] = useState<DBAppliance[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSlotRate, setCurrentSlotRate] = useState(7.42);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<DBAppliance | null>(null);
  const [editingAppliance, setEditingAppliance] = useState<DBAppliance | null>(null);
  const [schedulingAppliance, setSchedulingAppliance] = useState<DBAppliance | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Tariff optimization interceptor state
  const [tariffSlots, setTariffSlots] = useState<DBTariffSlot[]>([]);
  const [interceptAppliance, setInterceptAppliance] = useState<DBAppliance | null>(null);

  const isWeb = viewMode === 'web';
  const isTablet = viewMode === 'tablet';
  const isCompact = isWeb || isTablet;

  const fetchAppliances = useCallback(async () => {
    if (!home?.id) return;
    try {
      const { data, error } = await supabase
        .from('appliances')
        .select('*')
        .eq('home_id', home.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setAppliances(data || []);
    } catch (err) {
      console.error('Failed to fetch appliances:', err);
    }
  }, [home?.id]);

  const fetchSchedules = useCallback(async () => {
    if (!home?.id) return;
    try {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .eq('home_id', home.id)
        .eq('is_active', true);
      if (error) throw error;
      setSchedules(data || []);
    } catch (err) {
      console.error('Failed to fetch schedules:', err);
    }
  }, [home?.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchAppliances(), fetchSchedules()]);
      setLoading(false);
    };
    load();
  }, [fetchAppliances, fetchSchedules]);

  // Fetch tariff slots for interceptor
  useEffect(() => {
    if (home?.id) {
      fetchUserTariffSlots(home.id).then(slots => {
        console.log('[Interceptor] Tariff slots loaded:', slots.length, slots);
        setTariffSlots(slots);
      });
    }
  }, [home?.id]);

  // Real-time subscription to sync with Home page toggles
  useEffect(() => {
    if (!home?.id) return;

    const channel = supabase
      .channel('control-appliances')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appliances',
          filter: `home_id=eq.${home.id}`
        },
        () => {
          // Re-fetch on any change (insert, update, delete)
          fetchAppliances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [home?.id, fetchAppliances]);

  const toggleAppliance = async (appliance: DBAppliance) => {
    if (!appliance.is_controllable) return;

    // Intercept: if turning ON a heavy appliance during peak → show InterceptorModal
    const turningOn = appliance.status !== 'ON';
    const currentHour = new Date().getHours();
    console.log('[Interceptor] Toggle attempt:', {
      name: appliance.name,
      turningOn,
      currentHour,
      slotsCount: tariffSlots.length,
      tier: appliance.optimization_tier,
      category: appliance.category,
    });
    if (turningOn && tariffSlots.length > 0) {
      const intercept = shouldIntercept(appliance, tariffSlots, currentHour);
      console.log('[Interceptor] shouldIntercept result:', intercept);
      if (intercept) {
        setInterceptAppliance(appliance);
        return;
      }
    }

    setActionLoading(appliance.id);
    const newStatus = appliance.status === 'ON' ? 'OFF' : 'ON';
    try {
      const { error } = await supabase
        .from('appliances')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appliance.id);
      if (error) throw error;

      if (appliance.smart_plug_id) {
        console.log(`[Smart Plug] Toggling ${appliance.name} to ${newStatus}`);
      }

      await supabase.from('control_logs').insert({
        appliance_id: appliance.id,
        user_id: (await supabase.auth.getUser()).data.user?.id,
        action: newStatus === 'ON' ? 'turn_on' : 'turn_off',
        trigger_source: 'manual',
        result: 'success'
      });

      setAppliances(prev => prev.map(a =>
        a.id === appliance.id ? { ...a, status: newStatus } : a
      ));
    } catch (err) {
      console.error('Failed to toggle appliance:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteAppliance = async (applianceId: string) => {
    setActionLoading(applianceId);
    try {
      const { error } = await supabase
        .from('appliances')
        .update({ is_active: false })
        .eq('id', applianceId);
      if (error) throw error;
      setAppliances(prev => prev.filter(a => a.id !== applianceId));
    } catch (err) {
      console.error('Failed to delete appliance:', err);
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(null);
    }
  };

  const getCostPerHour = (ratedPowerW: number) => (ratedPowerW / 1000) * currentSlotRate;

  return (
    <div className={`pb-32 overflow-y-auto h-full no-scrollbar ${isCompact ? 'pt-6 px-6' : 'pt-10 px-5'}`}>
      <div className={`flex justify-between items-center ${isCompact ? 'mb-4' : 'mb-6'}`}>
        <h2 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Control Center</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className={`bg-primary text-white rounded-full shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all flex items-center gap-1.5 ${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'}`}
          >
            <Plus className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
            <span className="font-bold">Add Appliance</span>
          </button>
          <button className={`bg-white rounded-full border border-slate-200 shadow-sm text-slate-500 hover:rotate-90 transition-transform duration-500 ${isCompact ? 'p-1.5' : 'p-2'}`}>
            <Settings2 className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
          </button>
        </div>
      </div>

      <div className={`bg-slate-100 p-1.5 flex relative ${isCompact ? 'rounded-xl mb-4' : 'rounded-[1.5rem] mb-6'}`}>
        <div className={`absolute top-1.5 bottom-1.5 w-[48%] bg-white shadow-sm transition-all duration-300 ease-spring ${isCompact ? 'rounded-lg' : 'rounded-2xl'} ${autoMode ? 'left-1.5' : 'left-[50.5%]'}`} />
        <button onClick={() => setAutoMode(true)} className={`flex-1 text-sm font-bold relative z-10 flex items-center justify-center gap-2 transition-colors ${isCompact ? 'py-2 rounded-lg text-xs' : 'py-3 rounded-xl'} ${autoMode ? 'text-slate-800' : 'text-slate-400'}`}>
          <Bot className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} /> Auto-Pilot
        </button>
        <button onClick={() => setAutoMode(false)} className={`flex-1 text-sm font-bold relative z-10 flex items-center justify-center gap-2 transition-colors ${isCompact ? 'py-2 rounded-lg text-xs' : 'py-3 rounded-xl'} ${!autoMode ? 'text-slate-800' : 'text-slate-400'}`}>
          <Sliders className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} /> Manual
        </button>
      </div>

      <AnimatePresence>
        {autoMode && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className={`bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 flex items-start gap-3 ${isCompact ? 'mb-4 p-3 rounded-xl' : 'mb-6 p-5 rounded-[2rem]'}`}>
              <div className={`mt-1 rounded-full bg-emerald-400 animate-pulse shadow-glow ${isCompact ? 'min-w-[8px] h-2' : 'min-w-[12px] h-3'}`} />
              <div>
                <h4 className={`font-bold text-emerald-800 mb-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>AI Optimisation Active</h4>
                <p className={`text-emerald-700/70 leading-relaxed ${isCompact ? 'text-[10px]' : 'text-xs'}`}>System automatically manages appliances based on ToD tariff.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className={isCompact ? 'space-y-4' : 'space-y-6'}>
          <div>
            <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>My Appliances ({appliances.length})</h3>
            {appliances.length === 0 ? (
              <div className={`bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center ${isCompact ? 'rounded-xl p-6' : 'rounded-[2rem] p-10'}`}>
                <Zap className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-slate-400 text-sm font-medium mb-4">No appliances added yet</p>
                <button onClick={() => setShowAddModal(true)} className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Appliance
                </button>
              </div>
            ) : (
              <div className={`grid gap-3 ${isWeb ? 'grid-cols-4' : isTablet ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {appliances.map((appliance, idx) => (
                  <ApplianceTile key={appliance.id} appliance={appliance} compact={isCompact} costPerHour={getCostPerHour(appliance.rated_power_w)} isLoading={actionLoading === appliance.id}
                    schedules={schedules}
                    onToggle={() => toggleAppliance(appliance)}
                    onSchedule={() => { setSchedulingAppliance(appliance); setShowScheduleModal(true); }}
                    onEdit={() => { setEditingAppliance(appliance); setShowAddModal(true); }}
                    onDelete={() => setShowDeleteConfirm(appliance)}
                    delay={idx * 0.05}
                  />
                ))}
              </div>
            )}
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

          {schedules.length > 0 && (
            <div>
              <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>Scheduled Actions</h3>
              <div className="space-y-2">
                {schedules.map(schedule => {
                  const app = appliances.find(a => a.id === schedule.appliance_id);
                  const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  const daysDisplay = schedule.repeat_type === 'custom' && schedule.custom_days
                    ? schedule.custom_days.map(d => dayNames[d]).join(', ')
                    : schedule.repeat_type;
                  return (
                    <div key={schedule.id} className={`bg-white border border-slate-100 shadow-soft flex items-center justify-between ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}>
                          <Clock className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </div>
                        <div>
                          <p className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                            {app?.name || 'Unknown'} at {schedule.start_time?.slice(0, 5)}
                          </p>
                          <p className={`text-slate-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                            {daysDisplay}{schedule.created_by === 'ai_optimizer' ? ' • 🤖 AI' : ''}
                          </p>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-lg font-bold ${schedule.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'} ${isCompact ? 'text-[9px]' : 'text-xs'}`}>
                        {schedule.is_active ? 'Active' : 'Paused'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showAddModal && (
          <AddApplianceModal homeId={home?.id || ''} appliance={editingAppliance}
            onClose={() => { setShowAddModal(false); setEditingAppliance(null); }}
            onSaved={() => { setShowAddModal(false); setEditingAppliance(null); fetchAppliances(); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showScheduleModal && schedulingAppliance && (
          <ScheduleModal homeId={home?.id || ''} appliance={schedulingAppliance}
            tariffSlots={tariffSlots}
            onClose={() => { setShowScheduleModal(false); setSchedulingAppliance(null); }}
            onSaved={() => { setShowScheduleModal(false); setSchedulingAppliance(null); fetchSchedules(); fetchAppliances(); }}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6 text-rose-500" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 text-center mb-2">Remove Appliance?</h3>
                <p className="text-slate-500 text-sm text-center mb-6">
                  Are you sure you want to remove <span className="font-medium text-slate-700">{showDeleteConfirm.name}</span>? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteAppliance(showDeleteConfirm.id)}
                    disabled={actionLoading === showDeleteConfirm.id}
                    className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-bold flex items-center justify-center gap-2 hover:bg-rose-600 transition-colors disabled:opacity-50"
                  >
                    {actionLoading === showDeleteConfirm.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Remove
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tariff Optimization InterceptorModal */}
      <AnimatePresence>
        {interceptAppliance && home && (
          <InterceptorModal
            appliance={interceptAppliance}
            slots={tariffSlots}
            currentHour={new Date().getHours()}
            homeId={home.id}
            onClose={() => setInterceptAppliance(null)}
            onRunNow={async () => {
              // User chose "Ignore & Run Now" — proceed with toggle
              setInterceptAppliance(null);
              const appliance = interceptAppliance;
              setActionLoading(appliance.id);
              try {
                await supabase.from('appliances').update({ status: 'ON', updated_at: new Date().toISOString() }).eq('id', appliance.id);
                await supabase.from('control_logs').insert({ appliance_id: appliance.id, user_id: (await supabase.auth.getUser()).data.user?.id, action: 'turn_on', trigger_source: 'manual_override', result: 'success' });
                setAppliances(prev => prev.map(a => a.id === appliance.id ? { ...a, status: 'ON' } : a));
              } catch (err) { console.error('Failed to toggle:', err); }
              finally { setActionLoading(null); }
            }}
            onScheduled={() => {
              setInterceptAppliance(null);
              fetchAppliances();
              fetchSchedules();
            }}
            onEcoMode={
              interceptAppliance.optimization_tier === 'tier_3_comfort'
                ? async () => {
                  setInterceptAppliance(null);
                  await supabase.from('appliances').update({ eco_mode_enabled: true, status: 'ON', updated_at: new Date().toISOString() }).eq('id', interceptAppliance.id);
                  await supabase.from('control_logs').insert({ appliance_id: interceptAppliance.id, user_id: (await supabase.auth.getUser()).data.user?.id, action: 'eco_mode_on', trigger_source: 'optimizer', result: 'success' });
                  fetchAppliances();
                }
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Appliance Tile ─────────────────────────────────────────────────
interface ApplianceTileProps { appliance: DBAppliance; compact: boolean; costPerHour: number; isLoading: boolean; schedules: Schedule[]; onToggle: () => void; onSchedule: () => void; onEdit: () => void; onDelete: () => void; delay: number; }

const ApplianceTile: React.FC<ApplianceTileProps> = ({ appliance, compact, costPerHour, isLoading, schedules, onToggle, onSchedule, onEdit, onDelete, delay }) => {
  const isOn = appliance.status === 'ON' || appliance.status === 'WARNING';
  const isWarning = appliance.status === 'WARNING';
  const isScheduled = appliance.status === 'SCHEDULED';
  const hasSmartPlug = !!appliance.smart_plug_id;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay }}
      whileHover={compact ? {} : { y: -4, boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.1)" }}
      className={`group relative bg-white border flex flex-col justify-between overflow-hidden ${compact ? 'p-3 rounded-xl aspect-square' : 'p-4 rounded-[1.5rem] aspect-square'} ${isOn ? (isWarning ? 'border-rose-200' : 'border-cyan-200') : 'border-slate-100'}`}
    >
      {isOn && !isWarning && <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/50 to-transparent pointer-events-none" />}
      {isWarning && <div className="absolute inset-0 bg-gradient-to-br from-rose-50/50 to-transparent pointer-events-none" />}
      {hasSmartPlug && <div className={`absolute top-2 right-2 ${isOn ? 'text-emerald-500' : 'text-slate-300'}`}><Wifi className="w-3 h-3" /></div>}

      <div className="flex justify-between items-start z-10">
        <div className={`rounded-xl flex items-center justify-center ${compact ? 'w-8 h-8' : 'w-10 h-10'} ${isOn ? (isWarning ? 'bg-rose-100 text-rose-500' : 'bg-cyan-100 text-cyan-600') : 'bg-slate-100 text-slate-400'}`}>
          <ApplianceIcon category={appliance.category} />
        </div>
        <div className={`flex ${compact ? 'gap-1' : 'gap-1.5'}`}>
          {appliance.is_controllable && (
            <button onClick={(e) => { e.stopPropagation(); onSchedule(); }} className={`rounded-full bg-slate-100 text-slate-400 hover:bg-indigo-100 hover:text-indigo-500 transition-colors ${compact ? 'w-6 h-6' : 'w-7 h-7'} flex items-center justify-center`}>
              <Clock className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </button>
          )}
          {appliance.is_controllable ? (
            <button onClick={(e) => { e.stopPropagation(); onToggle(); }} disabled={isLoading}
              className={`rounded-full flex items-center justify-center transition-all ${compact ? 'w-6 h-6' : 'w-7 h-7'} ${isOn ? (isWarning ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white') : 'bg-slate-200 text-slate-400 hover:bg-slate-300'}`}
            >
              {isLoading ? <Loader2 className={`animate-spin ${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} /> : <Power className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
            </button>
          ) : (
            <div className={`rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center ${compact ? 'w-6 h-6' : 'w-7 h-7'}`}>
              <ToggleRight className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            </div>
          )}
        </div>
      </div>

      <div className={`z-10 ${compact ? 'mt-auto' : 'mt-2'}`}>
        <h3 className={`font-bold text-slate-800 leading-tight mb-1 line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{appliance.name}</h3>
        {isOn ? (
          <div className="flex flex-col">
            <div className={`flex items-center gap-1 ${compact ? 'mb-0' : 'mb-1'}`}>
              <span className={`font-bold ${isWarning ? 'text-rose-500' : 'text-cyan-600'} ${compact ? 'text-[10px]' : 'text-xs'}`}>{appliance.rated_power_w}W</span>
              <span className="w-1 h-1 rounded-full bg-slate-300" />
              <span className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>₹{costPerHour.toFixed(1)}/hr</span>
            </div>
            {!appliance.is_controllable && !compact && <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg self-start">Always On</span>}
          </div>
        ) : isScheduled ? (
          (() => {
            // Find the active schedule for this appliance to show the time
            const activeSchedule = schedules.find(s => s.appliance_id === appliance.id);
            const schedTime = activeSchedule?.start_time?.slice(0, 5) || appliance.schedule_time;
            // Format nicely: "Tonight 9 PM" or "9:00 AM"
            let displayTime = schedTime || '';
            if (schedTime) {
              const [hStr, mStr] = schedTime.split(':');
              const h = parseInt(hStr, 10);
              const now = new Date().getHours();
              const suffix = h >= 12 ? 'PM' : 'AM';
              const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
              const tonight = h > now ? 'Tonight' : '';
              displayTime = `${tonight ? tonight + ' ' : ''}${display}${mStr !== '00' ? ':' + mStr : ''} ${suffix}`;
            }
            return (
              <div className={`flex items-center gap-1 font-medium text-indigo-500 bg-indigo-50 rounded-lg self-start inline-flex ${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}`}>
                <Clock className={compact ? 'w-2 h-2' : 'w-3 h-3'} /> {displayTime || 'Scheduled'}
              </div>
            );
          })()
        ) : (
          <p className={`text-slate-400 font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>{appliance.is_controllable ? 'Tap to turn on' : 'Always running'}</p>
        )}
      </div>

      <div className={`absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
        <button onClick={onEdit} className="p-1 bg-slate-100 rounded text-slate-400 hover:text-slate-600"><Edit2 className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-1 bg-slate-100 rounded text-slate-400 hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
      </div>

      {isOn && !compact && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
          <motion.div initial={{ width: 0 }} animate={{ width: isWarning ? '90%' : '40%' }} transition={{ duration: 1 }} className={`h-full ${isWarning ? 'bg-rose-500' : 'bg-cyan-500'}`} />
        </div>
      )}
    </motion.div>
  );
};

// ── Appliance Icon ─────────────────────────────────────────────────
const ApplianceIcon: React.FC<{ category: ApplianceCategory }> = ({ category }) => {
  const cls = "w-5 h-5";
  switch (category) {
    case 'ac': case 'fan': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 8h20M4 12h16M6 16h12" /></svg>;
    case 'geyser': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" /></svg>;
    case 'refrigerator': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM3 10h18M10 6h4M10 16h4" /></svg>;
    case 'washing_machine': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2" /><circle cx="12" cy="13" r="5" /></svg>;
    case 'tv': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="15" rx="2" /><polyline points="17 2 12 7 7 2" /></svg>;
    case 'lighting': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14" /></svg>;
    default: return <Zap className={cls} />;
  }
};

// ── Add Appliance Modal ────────────────────────────────────────────
interface AddApplianceModalProps { homeId: string; appliance: DBAppliance | null; onClose: () => void; onSaved: () => void; }

const AddApplianceModal: React.FC<AddApplianceModalProps> = ({ homeId, appliance, onClose, onSaved }) => {
  const isEdit = !!appliance;
  const [name, setName] = useState(appliance?.name || '');
  const [category, setCategory] = useState<ApplianceCategory>(appliance?.category || 'other');
  const [isControllable, setIsControllable] = useState(appliance?.is_controllable ?? true);
  const [hasSmartPlug, setHasSmartPlug] = useState(!!appliance?.smart_plug_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Please enter appliance name'); return; }
    setSaving(true); setError('');
    try {
      const data = { home_id: homeId, name: name.trim(), category, icon: CATEGORY_OPTIONS.find(c => c.value === category)?.icon || 'zap', rated_power_w: 0, is_controllable: isControllable, source: hasSmartPlug ? 'smart_plug' : 'nilm', status: 'OFF', is_active: true, updated_at: new Date().toISOString() };
      if (isEdit) { const { error: err } = await supabase.from('appliances').update(data).eq('id', appliance.id); if (err) throw err; }
      else { const { error: err } = await supabase.from('appliances').insert(data); if (err) throw err; }
      onSaved();
    } catch (err: any) { setError(err.message || 'Failed to save appliance'); }
    finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto mb-20 sm:mb-0">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800">{isEdit ? 'Edit Appliance' : 'Add Appliance'}</h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Living Room AC" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORY_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setCategory(opt.value)} className={`p-3 rounded-xl border text-center transition-all ${category === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <div className="flex flex-col items-center gap-1"><ApplianceIcon category={opt.value} /><span className="text-[10px] font-medium">{opt.label.split(' ')[0]}</span></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl">
              <div className="flex items-start gap-2">
                <Zap className="w-4 h-4 text-cyan-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-cyan-700">Power consumption will be automatically detected via {hasSmartPlug ? 'Smart Plug' : 'NILM (AI energy disaggregation)'}.</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div><p className="font-medium text-slate-800">Can be turned ON/OFF</p><p className="text-xs text-slate-400">Disable for always-on devices like fridge</p></div>
              <button onClick={() => setIsControllable(!isControllable)} className={`w-12 h-7 rounded-full transition-all ${isControllable ? 'bg-primary' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${isControllable ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
              <div className="flex items-center gap-3">
                <Wifi className="w-5 h-5 text-slate-400" />
                <div><p className="font-medium text-slate-800">Connected to Smart Plug</p><p className="text-xs text-slate-400">Enable remote control over WiFi</p></div>
              </div>
              <button onClick={() => setHasSmartPlug(!hasSmartPlug)} className={`w-12 h-7 rounded-full transition-all ${hasSmartPlug ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${hasSmartPlug ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {error && <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 p-3 rounded-xl"><AlertCircle className="w-4 h-4" /> {error}</div>}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/30">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {isEdit ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ── Schedule Modal ─────────────────────────────────────────────────
interface ScheduleModalProps { homeId: string; appliance: DBAppliance; tariffSlots: DBTariffSlot[]; onClose: () => void; onSaved: () => void; }

const DURATION_OPTIONS = [
  { label: '15 min', value: 0.25 },
  { label: '30 min', value: 0.5 },
  { label: '1 hr', value: 1 },
  { label: '2 hr', value: 2 },
  { label: 'Custom', value: -1 },
  { label: 'Let it run', value: 0 },
];

const ScheduleModal: React.FC<ScheduleModalProps> = ({ homeId, appliance, tariffSlots, onClose, onSaved }) => {
  // Internal time stored as 24h HH:MM for backend; AM/PM for display
  const [hour12, setHour12] = useState(10);      // 1-12
  const [minute, setMinute] = useState(0);        // 0-59
  const [ampm, setAmpm] = useState<'AM' | 'PM'>('PM');
  const [durationValue, setDurationValue] = useState(1); // hours, 0 = no auto-off, -1 = custom
  const [customMinutes, setCustomMinutes] = useState(45);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Convert AM/PM state to 24h string for backend
  const to24h = (h12: number, m: number, period: 'AM' | 'PM'): string => {
    let h24 = h12 % 12;
    if (period === 'PM') h24 += 12;
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const time = to24h(hour12, minute, ampm);

  // Display formatted time
  const displayTime = `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  // Effective duration in hours
  const effectiveDuration = durationValue === -1 ? customMinutes / 60 : durationValue;

  // Cost calculation for the selected time
  const selectedHour = parseInt(time.split(':')[0], 10);
  const selectedSlot = tariffSlots.length > 0 ? getSlotForHour(selectedHour, tariffSlots) : null;
  const isPeak = selectedSlot?.slot_type === 'peak';

  // Cost if run at selected time vs cheapest
  const costNow = tariffSlots.length > 0 && effectiveDuration > 0
    ? calculateCostForTime(appliance.rated_power_w, selectedHour, effectiveDuration, tariffSlots, minute)
    : 0;

  // Find cheapest slot
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
      // UPSERT: Delete any existing pending schedules for this appliance
      await supabase
        .from('schedules')
        .delete()
        .eq('appliance_id', appliance.id)
        .eq('is_active', true);

      // Calculate end_time if duration is set (not "Let it run")
      let endTime: string | null = null;
      if (effectiveDuration > 0) {
        const [hStr, mStr] = time.split(':');
        const totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + Math.round(effectiveDuration * 60);
        const endH = Math.floor(totalMinutes / 60) % 24;
        const endM = totalMinutes % 60;
        endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      }

      // Insert new schedule (single row: ON at start_time, OFF at end_time)
      const { error: err } = await supabase.from('schedules').insert({
        home_id: homeId,
        appliance_id: appliance.id,
        start_time: time,
        end_time: endTime,
        repeat_type: 'once',
        is_active: true,
        created_by: 'user',
      });
      if (err) throw err;

      // Update appliance card to show scheduled time
      await supabase.from('appliances')
        .update({ status: 'SCHEDULED', schedule_time: time, updated_at: new Date().toISOString() })
        .eq('id', appliance.id);

      onSaved();
    } catch (err: any) { setError(err.message || 'Failed to create schedule'); }
    finally { setSaving(false); }
  };


  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} onClick={e => e.stopPropagation()} className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md mb-20 sm:mb-0 max-h-[85vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-5">
            <div><h2 className="text-xl font-bold text-slate-800">Schedule</h2><span className="text-sm text-slate-400">{appliance.name} • {appliance.rated_power_w}W</span></div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
          </div>

          <div className="space-y-5">
            {/* AM/PM Time Picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Start Time</label>
              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                {/* Hour selector */}
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">Hour</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(h => (
                      <button key={h} onClick={() => setHour12(h)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all ${hour12 === h ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'
                          }`}
                      >{h}</button>
                    ))}
                  </div>
                </div>
                {/* Minute selector — scrollable wheel 0-59 */}
                <div className="w-16">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">Min</label>
                  <div className="flex flex-col gap-0.5 h-[140px] overflow-y-auto snap-y snap-mandatory scrollbar-thin" id="minute-scroll">
                    {Array.from({ length: 60 }, (_, m) => (
                      <button key={m} onClick={() => setMinute(m)}
                        className={`py-1 rounded-lg text-xs font-bold transition-all flex-shrink-0 snap-center ${minute === m ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'
                          }`}
                      >{String(m).padStart(2, '0')}</button>
                    ))}
                  </div>
                </div>
                {/* AM/PM selector */}
                <div className="w-14">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block text-center">&nbsp;</label>
                  <div className="flex flex-col gap-1">
                    <button onClick={() => setAmpm('AM')}
                      className={`py-2.5 rounded-lg text-xs font-bold transition-all ${ampm === 'AM' ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'
                        }`}
                    >AM</button>
                    <button onClick={() => setAmpm('PM')}
                      className={`py-2.5 rounded-lg text-xs font-bold transition-all ${ampm === 'PM' ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-indigo-50'
                        }`}
                    >PM</button>
                  </div>
                </div>
              </div>
              {/* Selected time display + peak indicator */}
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
                  <button
                    key={opt.label}
                    onClick={() => setDurationValue(opt.value)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${durationValue === opt.value
                      ? (opt.value === 0 ? 'bg-amber-500 text-white' : 'bg-indigo-500 text-white')
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {/* Custom duration slider */}
              {durationValue === -1 && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Custom Duration</span>
                    <span className="font-bold text-slate-800">{customMinutes} min</span>
                  </div>
                  <input
                    type="range" min="5" max="240" step="5"
                    value={customMinutes}
                    onChange={e => setCustomMinutes(parseInt(e.target.value, 10))}
                    className="w-full accent-indigo-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>5 min</span><span>4 hrs</span>
                  </div>
                </div>
              )}
              {/* Let it run warning */}
              {durationValue === 0 && (
                <div className="mt-2 text-[11px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Appliance will stay ON until you manually turn it off. No auto-off.</span>
                </div>
              )}
            </div>

            {/* Cost Comparison — only visible when tariff data exists and duration > 0 */}
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
                      <span className="text-xs text-slate-500">
                        Cheapest at {formatHour(cheapestSlot.start_hour)} ({cheapestSlot.slot_type})
                      </span>
                      <span className="text-sm font-bold text-emerald-600">₹{cheapestCost.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-bold text-amber-600">
                        You'd save ₹{savings.toFixed(2)} ({Math.round((savings / costNow) * 100)}%) by shifting
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const cheapHour = cheapestSlot.start_hour;
                        // Convert 24h hour to 12h AM/PM state
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

            {error && <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 p-3 rounded-xl"><AlertCircle className="w-4 h-4" /> {error}</div>}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 font-bold text-slate-600">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-indigo-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />} Set Schedule
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div >
  );
};

export default Control;