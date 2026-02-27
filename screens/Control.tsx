import React, { useState, useEffect, useCallback } from 'react';
import {
  Power, Bot, Sliders, Settings2, Zap, Plus, Trash2, Clock, Wifi, WifiOff,
  X, Check, ChevronDown, AlertCircle, Calendar, Loader2, Edit2, ToggleRight,
  Shield, Play, Pause
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';
import { DBAppliance, DBTariffSlot, ApplianceCategory } from '../types/database';
import InterceptorModal from '../components/InterceptorModal';
import ScheduleModal from '../components/ScheduleModal';
import { shouldIntercept, fetchUserTariffSlots, calculateCostForTime, getSlotForHour, formatHour } from '../utils/tariffOptimizer';
import { toggleAppliance as apiToggle, setEcoMode as apiEcoMode } from '../services/backend';
import {
  getAutopilotStatus, getAutopilotRules, createAutopilotRule, updateAutopilotRule,
  deleteAutopilotRule, toggleAutopilot, simulateAutopilot,
  AutopilotRule, AutopilotStatus as APStatus, SimulationResult
} from '../services/backend';

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

  // Autopilot state
  const [autopilotStatus, setAutopilotStatus] = useState<APStatus | null>(null);
  const [autopilotRules, setAutopilotRules] = useState<AutopilotRule[]>([]);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);

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
        .order('created_at', { ascending: false });
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

  // Fetch autopilot status + rules
  const fetchAutopilot = useCallback(async () => {
    if (!home?.id) return;
    try {
      const [status, rules] = await Promise.all([
        getAutopilotStatus(home.id),
        getAutopilotRules(home.id),
      ]);
      setAutopilotStatus(status);
      setAutopilotRules(rules);
    } catch (err) {
      console.error('Failed to fetch autopilot data:', err);
    }
  }, [home?.id]);

  useEffect(() => {
    fetchAutopilot();
  }, [fetchAutopilot]);

  // Unified refresh callback for Realtime + polling
  const refresh = useCallback(() => {
    fetchAppliances();
    fetchSchedules();
  }, [fetchAppliances, fetchSchedules]);

  // Real-time subscription to sync with Home page toggles + backend schedule changes
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
        () => refresh()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'schedules',
          filter: `home_id=eq.${home.id}`
        },
        () => refresh()
      )
      .subscribe();

    // Polling fallback: refresh every 5s
    const poll = setInterval(refresh, 5_000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [home?.id, refresh]);

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
    const action = newStatus === 'ON' ? 'turn_on' : 'turn_off';
    try {
      const result = await apiToggle(appliance.id, action);
      if (!result.success) throw new Error(result.message || 'Toggle failed');

      setAppliances(prev => prev.map(a =>
        a.id === appliance.id ? { ...a, status: result.new_status as any } : a
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
            <AutopilotPanel
              homeId={home?.id || ''}
              appliances={appliances}
              status={autopilotStatus}
              rules={autopilotRules}
              simulation={simulation}
              loading={autopilotLoading}
              compact={isCompact}
              onToggle={async (enabled) => {
                if (!home?.id) return;
                setAutopilotLoading(true);
                try {
                  await toggleAutopilot(home.id, enabled);
                  await fetchAutopilot();
                } catch (err) { console.error(err); }
                finally { setAutopilotLoading(false); }
              }}
              onSimulate={async () => {
                if (!home?.id) return;
                setAutopilotLoading(true);
                try {
                  const res = await simulateAutopilot(home.id);
                  setSimulation(res);
                } catch (err) { console.error(err); }
                finally { setAutopilotLoading(false); }
              }}
              onCreateRule={async (rule) => {
                try {
                  await createAutopilotRule(rule);
                  await fetchAutopilot();
                } catch (err) { console.error(err); }
              }}
              onToggleRule={async (ruleId, active) => {
                try {
                  await updateAutopilotRule(ruleId, { is_active: active });
                  await fetchAutopilot();
                } catch (err) { console.error(err); }
              }}
              onDeleteRule={async (ruleId) => {
                try {
                  await deleteAutopilotRule(ruleId);
                  await fetchAutopilot();
                } catch (err) { console.error(err); }
              }}
            />
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

          {autopilotRules.length > 0 && !autoMode && (
            <div>
              <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>Active Rules</h3>
              <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {autopilotRules.filter(r => r.is_active).map(rule => (
                  <motion.div key={rule.id} whileHover={isCompact ? {} : { scale: 1.01 }} className={`bg-white border shadow-soft flex flex-col gap-2 ${isCompact ? 'rounded-xl p-3' : 'rounded-[2rem] p-5 gap-3'} ${rule.is_triggered ? 'border-l-4 border-l-amber-500 border-y border-r border-slate-100' : 'border-slate-100'}`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-xl flex items-center justify-center ${isCompact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl'} ${rule.is_triggered ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Shield className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </div>
                        <h4 className={`text-slate-800 font-bold ${isCompact ? 'text-xs' : 'text-sm'}`}>{rule.name}</h4>
                      </div>
                      <span className={`rounded-lg font-bold ${rule.is_triggered ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'} ${isCompact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'}`}>{rule.is_triggered ? 'Triggered' : 'Active'}</span>
                    </div>
                    <p className={`text-slate-400 font-medium ${isCompact ? 'text-[10px] pl-10' : 'text-xs pl-12'}`}>{rule.description || `${rule.action} during ${rule.condition_type}`}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {schedules.length > 0 && (
            <div>
              <h3 className={`font-bold text-slate-800 px-1 ${isCompact ? 'text-sm mb-2' : 'text-lg mb-4'}`}>Scheduled Actions</h3>
              <div className="space-y-2">
                {[...schedules]
                  .sort((a, b) => {
                    // Active first, then by created_at desc
                    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
                    return 0; // already ordered by created_at desc from DB
                  })
                  .map(schedule => {
                  const app = appliances.find(a => a.id === schedule.appliance_id);
                  const dayNames = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                  const daysDisplay = schedule.repeat_type === 'custom' && schedule.custom_days
                    ? schedule.custom_days.map(d => dayNames[d]).join(', ')
                    : schedule.repeat_type;

                  // Compute "Runs until" display
                  const endTimeDisplay = schedule.end_time ? schedule.end_time.slice(0, 5) : null;
                  const startTimeDisplay = schedule.start_time?.slice(0, 5);

                  // Determine if this schedule is currently running
                  const now = new Date();
                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const [sh, sm] = (schedule.start_time || '00:00').split(':').map(Number);
                  const startMins = sh * 60 + sm;
                  let endMins = -1;
                  let isRunning = false;
                  if (schedule.end_time) {
                    const [eh, em] = schedule.end_time.split(':').map(Number);
                    endMins = eh * 60 + em;
                    // Handle midnight crossing
                    if (endMins <= startMins) {
                      isRunning = schedule.is_active && (nowMins >= startMins || nowMins < endMins);
                    } else {
                      isRunning = schedule.is_active && nowMins >= startMins && nowMins < endMins;
                    }
                  } else {
                    isRunning = schedule.is_active && app?.status === 'ON' && nowMins >= startMins;
                  }

                  // Completed = not active and has a last_executed
                  const isCompleted = !schedule.is_active;

                  return (
                    <div key={schedule.id} className={`bg-white border shadow-soft flex items-center justify-between ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'} ${isCompleted ? 'opacity-50 border-slate-100' : isRunning ? 'border-cyan-200' : 'border-slate-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`rounded-xl flex items-center justify-center ${isCompact ? 'w-8 h-8' : 'w-10 h-10'} ${isRunning ? 'bg-cyan-100 text-cyan-600' : isCompleted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Clock className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
                        </div>
                        <div>
                          <p className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                            {app?.name || 'Unknown'} at {startTimeDisplay}
                            {endTimeDisplay ? ` · until ${endTimeDisplay}` : ''}
                          </p>
                          <p className={`text-slate-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                            {isRunning ? '🟢 Running now' : ''}
                            {isRunning && endTimeDisplay ? ` · Ends at ${endTimeDisplay}` : ''}
                            {!isRunning ? daysDisplay : ''}
                            {schedule.created_by === 'ai_optimizer' ? ' • 🤖 AI' : ''}
                          </p>
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-lg font-bold ${isRunning ? 'bg-cyan-50 text-cyan-600' : schedule.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'} ${isCompact ? 'text-[9px]' : 'text-xs'}`}>
                        {isRunning ? 'Running' : schedule.is_active ? 'Active' : 'Done'}
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
              // User chose "Ignore & Run Now" — proceed with toggle via backend
              setInterceptAppliance(null);
              const appliance = interceptAppliance;
              setActionLoading(appliance.id);
              try {
                const result = await apiToggle(appliance.id, 'turn_on');
                if (result.success) setAppliances(prev => prev.map(a => a.id === appliance.id ? { ...a, status: 'ON' } : a));
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
                  await apiEcoMode(interceptAppliance.id, true);
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

// ── Autopilot Panel ────────────────────────────────────────────────
interface AutopilotPanelProps {
  homeId: string;
  appliances: DBAppliance[];
  status: APStatus | null;
  rules: AutopilotRule[];
  simulation: SimulationResult | null;
  loading: boolean;
  compact: boolean;
  onToggle: (enabled: boolean) => void;
  onSimulate: () => void;
  onCreateRule: (rule: any) => void;
  onToggleRule: (ruleId: string, active: boolean) => void;
  onDeleteRule: (ruleId: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  turn_off: 'Turn Off',
  eco_mode: 'Eco Mode',
  reduce_power: 'Reduce Power',
};

const AutopilotPanel: React.FC<AutopilotPanelProps> = ({
  homeId, appliances, status, rules, simulation, loading, compact,
  onToggle, onSimulate, onCreateRule, onToggleRule, onDeleteRule,
}) => {
  const enabled = status?.enabled ?? false;
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleAction, setNewRuleAction] = useState('turn_off');
  const [selectedApplianceIds, setSelectedApplianceIds] = useState<string[]>([]);

  const controllable = appliances.filter(a => a.is_controllable);

  const handleCreateRule = () => {
    if (!newRuleName.trim() || selectedApplianceIds.length === 0) return;
    onCreateRule({
      home_id: homeId,
      name: newRuleName.trim(),
      description: `${ACTION_LABELS[newRuleAction]} selected appliances during peak tariff`,
      condition_type: 'peak_tariff',
      condition_value: { min_rate: 9.0 },
      target_appliance_ids: selectedApplianceIds,
      action: newRuleAction,
    });
    setShowAddRule(false);
    setNewRuleName('');
    setNewRuleAction('turn_off');
    setSelectedApplianceIds([]);
  };

  return (
    <div className={`space-y-3 ${compact ? 'mb-4' : 'mb-6'}`}>
      {/* Master Toggle */}
      <div className={`bg-gradient-to-r ${enabled ? 'from-emerald-50 to-teal-50 border-emerald-100' : 'from-slate-50 to-slate-100 border-slate-200'} border flex items-center justify-between ${compact ? 'p-3 rounded-xl' : 'p-5 rounded-[2rem]'}`}>
        <div className="flex items-center gap-3">
          <div className={`rounded-full ${enabled ? 'bg-emerald-400 animate-pulse shadow-glow' : 'bg-slate-300'} ${compact ? 'w-2 h-2' : 'w-3 h-3'}`} />
          <div>
            <h4 className={`font-bold ${enabled ? 'text-emerald-800' : 'text-slate-600'} ${compact ? 'text-xs' : 'text-sm'}`}>
              {enabled ? 'Peak Optimization Active' : 'Autopilot Disabled'}
            </h4>
            <p className={`${enabled ? 'text-emerald-700/70' : 'text-slate-400'} ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {enabled
                ? `${status?.protected_appliances || 0} appliance(s) protected · ${status?.active_rules || 0} rule(s)`
                : 'Enable to auto-manage appliances during peak tariff'
              }
            </p>
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          disabled={loading}
          className={`${compact ? 'w-10 h-6' : 'w-12 h-7'} rounded-full transition-all flex-shrink-0 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
        >
          <div className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} bg-white rounded-full shadow transition-transform ${enabled ? (compact ? 'translate-x-5' : 'translate-x-6') : 'translate-x-1'}`} />
        </button>
      </div>

      {enabled && (
        <>
          {/* Active Rules */}
          {rules.length > 0 && (
            <div className="space-y-2">
              {rules.map(rule => {
                const targetApps = appliances.filter(a => (rule.target_appliance_ids || []).includes(a.id));
                return (
                  <div key={rule.id} className={`bg-white border shadow-soft flex flex-col ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'} ${rule.is_triggered ? 'border-amber-200' : 'border-slate-100'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`rounded-lg flex items-center justify-center ${compact ? 'w-7 h-7' : 'w-9 h-9'} ${rule.is_triggered ? 'bg-amber-100 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          <Shield className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                        </div>
                        <div>
                          <p className={`font-bold text-slate-800 ${compact ? 'text-xs' : 'text-sm'}`}>{rule.name}</p>
                          <p className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                            {ACTION_LABELS[rule.action] || rule.action} · {targetApps.length} appliance(s)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-lg font-bold ${rule.is_triggered ? 'bg-amber-50 text-amber-600' : rule.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'} ${compact ? 'text-[8px]' : 'text-[10px]'}`}>
                          {rule.is_triggered ? 'Triggered' : rule.is_active ? 'Ready' : 'Paused'}
                        </span>
                        <button onClick={() => onToggleRule(rule.id, !rule.is_active)} className="p-1 rounded hover:bg-slate-100">
                          {rule.is_active ? <Pause className="w-3 h-3 text-slate-400" /> : <Play className="w-3 h-3 text-slate-400" />}
                        </button>
                        <button onClick={() => onDeleteRule(rule.id)} className="p-1 rounded hover:bg-rose-50">
                          <Trash2 className="w-3 h-3 text-slate-400 hover:text-rose-500" />
                        </button>
                      </div>
                    </div>
                    {targetApps.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-2 ${compact ? 'pl-9' : 'pl-11'}`}>
                        {targetApps.map(a => (
                          <span key={a.id} className={`bg-slate-100 text-slate-600 rounded-md font-medium ${compact ? 'text-[8px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}>
                            {a.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Rule */}
          {!showAddRule ? (
            <button
              onClick={() => setShowAddRule(true)}
              className={`w-full border-2 border-dashed border-slate-200 text-slate-400 font-bold flex items-center justify-center gap-2 hover:border-primary hover:text-primary transition-colors ${compact ? 'rounded-xl py-2 text-xs' : 'rounded-2xl py-3 text-sm'}`}
            >
              <Plus className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} /> Add Peak Rule
            </button>
          ) : (
            <div className={`bg-white border border-slate-200 shadow-soft ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newRuleName}
                  onChange={e => setNewRuleName(e.target.value)}
                  placeholder="Rule name (e.g. Peak Saver)"
                  className={`w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${compact ? 'text-xs' : 'text-sm'}`}
                />

                <div>
                  <label className={`block font-medium text-slate-600 mb-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>Action during peak</label>
                  <div className="flex gap-2">
                    {(['turn_off', 'eco_mode'] as const).map(act => (
                      <button
                        key={act}
                        onClick={() => setNewRuleAction(act)}
                        className={`flex-1 py-2 rounded-xl border font-bold transition-all ${compact ? 'text-[10px]' : 'text-xs'} ${newRuleAction === act ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-500'}`}
                      >
                        {ACTION_LABELS[act]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={`block font-medium text-slate-600 mb-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>Select appliances</label>
                  <div className={`flex flex-wrap gap-1.5`}>
                    {controllable.map(a => {
                      const selected = selectedApplianceIds.includes(a.id);
                      return (
                        <button
                          key={a.id}
                          onClick={() => setSelectedApplianceIds(prev =>
                            selected ? prev.filter(id => id !== a.id) : [...prev, a.id]
                          )}
                          className={`px-2.5 py-1.5 rounded-xl border font-medium transition-all ${compact ? 'text-[10px]' : 'text-xs'} ${selected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                        >
                          {selected && <Check className="w-3 h-3 inline mr-1" />}
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowAddRule(false)} className={`flex-1 py-2 rounded-xl border border-slate-200 font-bold text-slate-500 ${compact ? 'text-xs' : 'text-sm'}`}>Cancel</button>
                  <button
                    onClick={handleCreateRule}
                    disabled={!newRuleName.trim() || selectedApplianceIds.length === 0}
                    className={`flex-1 py-2 rounded-xl bg-primary text-white font-bold disabled:opacity-40 ${compact ? 'text-xs' : 'text-sm'}`}
                  >
                    Create Rule
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Simulate button */}
          <button
            onClick={onSimulate}
            disabled={loading}
            className={`w-full bg-indigo-50 border border-indigo-100 text-indigo-600 font-bold flex items-center justify-center gap-2 hover:bg-indigo-100 transition-colors ${compact ? 'rounded-xl py-2 text-xs' : 'rounded-2xl py-3 text-sm'}`}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            Simulate Peak
          </button>

          {/* Simulation result */}
          {simulation && (
            <div className={`bg-indigo-50 border border-indigo-100 ${compact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
              <p className={`font-bold text-indigo-800 mb-2 ${compact ? 'text-xs' : 'text-sm'}`}>
                Simulation: {simulation.message}
              </p>
              {simulation.would_affect.length > 0 ? (
                <div className="space-y-1">
                  {simulation.would_affect.map((item, i) => (
                    <div key={i} className={`flex justify-between items-center ${compact ? 'text-[10px]' : 'text-xs'}`}>
                      <span className="text-indigo-700">{item.name} → {ACTION_LABELS[item.action] || item.action}</span>
                      <span className="text-indigo-500 font-medium">saves ₹{item.hourly_savings}/hr</span>
                    </div>
                  ))}
                  <div className={`border-t border-indigo-200 pt-1 mt-1 flex justify-between font-bold text-indigo-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    <span>Total savings</span>
                    <span>₹{simulation.total_savings_estimate}/hr</span>
                  </div>
                </div>
              ) : (
                <p className={`text-indigo-600 ${compact ? 'text-[10px]' : 'text-xs'}`}>No appliances currently ON that would be affected.</p>
              )}
            </div>
          )}
        </>
      )}
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
            const activeSchedule = schedules.find(s => s.appliance_id === appliance.id && s.is_active);
            const schedTime = activeSchedule?.start_time?.slice(0, 5) || appliance.schedule_time;
            const endTime = activeSchedule?.end_time?.slice(0, 5);
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
            // "Runs until" label
            let untilLabel = '';
            if (endTime) {
              const [eh, em] = endTime.split(':').map(Number);
              const eSuffix = eh >= 12 ? 'PM' : 'AM';
              const eDisplay = eh === 0 ? 12 : eh > 12 ? eh - 12 : eh;
              untilLabel = `Until ${eDisplay}${em ? ':' + String(em).padStart(2, '0') : ''} ${eSuffix}`;
            }
            return (
              <div className="flex flex-col gap-0.5">
                <div className={`flex items-center gap-1 font-medium text-indigo-500 bg-indigo-50 rounded-lg self-start inline-flex ${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}`}>
                  <Clock className={compact ? 'w-2 h-2' : 'w-3 h-3'} /> {displayTime || 'Scheduled'}
                </div>
                {untilLabel && (
                  <span className={`text-slate-400 font-medium ${compact ? 'text-[8px]' : 'text-[10px]'}`}>{untilLabel}</span>
                )}
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

export default Control;