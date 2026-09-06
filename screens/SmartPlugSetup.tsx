import React, { useState, useEffect } from 'react';
import { ArrowLeft, Wifi, QrCode, Check, Zap, Radio, RefreshCw, Smartphone, Plug, ChevronRight, AlertCircle, Link, Power, Activity, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tab } from '../types';
import { useApp } from '../contexts/AppContext';
import { registerPlug, listPlugs, getPlugStatus, linkPlug, PlugSummaryData, PlugStatusData } from '../services/backend';
import { supabase } from '../services/supabase';
import SmartPlugDetail from './SmartPlugDetail';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  viewMode?: ViewMode;
}

const SmartPlugSetup: React.FC<Props> = ({ onBack, viewMode = 'mobile' }) => {
  const { home } = useApp();
  const [step, setStep] = useState(1);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [plugStatus, setPlugStatus] = useState<PlugStatusData | null>(null);
  const [linking, setLinking] = useState(false);
  const [linkedAppliance, setLinkedAppliance] = useState('');
  const [existingPlugs, setExistingPlugs] = useState<PlugSummaryData[]>([]);
  const [appliances, setAppliances] = useState<Array<{id: string; name: string; icon: string; smart_plug_id: string | null}>>([]);
  const [registeredPlugId, setRegisteredPlugId] = useState('');

  // Form fields
  const [deviceId, setDeviceId] = useState('');
  const [localKey, setLocalKey] = useState('');
  const [plugName, setPlugName] = useState('');
  const [selectedApplianceId, setSelectedApplianceId] = useState('');

  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  // Detail view state
  const [detailPlug, setDetailPlug] = useState<PlugSummaryData | null>(null);

  // Load existing plugs and appliances
  useEffect(() => {
    if (home?.id) {
      loadExistingPlugs();
      loadAppliances();
    }
  }, [home?.id]);

  const loadExistingPlugs = async () => {
    if (!home?.id) return;
    try {
      const plugs = await listPlugs(home.id);
      setExistingPlugs(plugs);
    } catch (e) {
      console.error('Failed to load plugs:', e);
    }
  };

  const loadAppliances = async () => {
    if (!home?.id) return;
    try {
      const { data } = await supabase
        .from('appliances')
        .select('id, name, icon, smart_plug_id')
        .eq('home_id', home.id)
        .eq('is_active', true)
        .order('sort_order');
      setAppliances(data || []);
    } catch (e) {
      console.error('Failed to load appliances:', e);
    }
  };

  const handleRegister = async () => {
    if (!home?.id || !deviceId.trim()) return;

    setIsRegistering(true);
    setRegistrationError('');
    try {
      const result = await registerPlug({
        home_id: home.id,
        tuya_device_id: deviceId.trim(),
        name: plugName.trim() || undefined,
        local_key: localKey.trim() || undefined,
        device_type: 'wipro_16a',
      });
      setRegisteredPlugId(result.plug_id);
      setRegistrationSuccess(true);

      // Try to get live status
      try {
        const status = await getPlugStatus(result.plug_id);
        setPlugStatus(status);
      } catch {
        // Plug might not be reachable yet
      }

      setStep(2);
    } catch (e: any) {
      setRegistrationError(e.message || 'Registration failed');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLinkAppliance = async () => {
    if (!registeredPlugId || !selectedApplianceId) return;
    setLinking(true);
    try {
      const result = await linkPlug(registeredPlugId, selectedApplianceId) as any;
      setLinkedAppliance(result.appliance_name || result.message || 'Appliance');
      setStep(3);
    } catch (e: any) {
      setRegistrationError(e.message || 'Linking failed');
    } finally {
      setLinking(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!registeredPlugId) return;
    try {
      const status = await getPlugStatus(registeredPlugId);
      setPlugStatus(status);
    } catch (e) {
      console.error('Status refresh failed:', e);
    }
  };

  // ── If viewing a plug detail, show the detail screen ──
  if (detailPlug) {
    return (
      <SmartPlugDetail
        plugId={detailPlug.id}
        plugName={detailPlug.name || 'Smart Plug'}
        linkedAppliance={detailPlug.linked_appliance || undefined}
        onBack={() => { setDetailPlug(null); loadExistingPlugs(); }}
        viewMode={viewMode}
      />
    );
  }

  return (
    <div className={`pb-32 overflow-y-auto h-full no-scrollbar bg-slate-50 ${isCompact ? 'pt-6 px-6' : 'pt-8 px-5'}`}>

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 active:scale-95 transition-transform ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
        >
          <ArrowLeft className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
        <div>
          <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Smart Plug Setup</h1>
          <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Connect your Wipro 16A smart plug</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className={`flex items-center justify-between mb-8 ${isCompact ? 'px-2' : 'px-4'}`}>
        {['Register', 'Link', 'Live'].map((label, idx) => {
          const s = idx + 1;
          return (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center">
                <div className={`rounded-full flex items-center justify-center font-bold transition-all ${
                  step >= s
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-200 text-slate-400'
                } ${isCompact ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'}`}>
                  {step > s ? <Check className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} /> : s}
                </div>
                <span className={`mt-1 font-medium text-slate-500 ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>
                  {label}
                </span>
              </div>
              {s < 3 && (
                <div className={`flex-1 h-1 mx-2 rounded-full ${step > s ? 'bg-cyan-500' : 'bg-slate-200'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {/* ── Step 1: Register Plug ── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Registration Form */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <Plug className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Register Your Plug</h3>
                  <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Enter your Tuya Device ID from the Tuya IoT console</p>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div>
                  <label className={`text-slate-500 font-medium mb-1 block ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                    Tuya Device ID *
                  </label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="e.g. bfxxxxxxxxxxxxxxxx"
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-cyan-500 ${isCompact ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'}`}
                  />
                </div>
                <div>
                  <label className={`text-slate-500 font-medium mb-1 block ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                    Local Key (for LAN control — optional)
                  </label>
                  <input
                    type="text"
                    value={localKey}
                    onChange={(e) => setLocalKey(e.target.value)}
                    placeholder="Found in Tuya IoT console → Devices"
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-cyan-500 ${isCompact ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'}`}
                  />
                </div>
                <div>
                  <label className={`text-slate-500 font-medium mb-1 block ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                    Plug Name (optional)
                  </label>
                  <input
                    type="text"
                    value={plugName}
                    onChange={(e) => setPlugName(e.target.value)}
                    placeholder="e.g. Bedroom AC Plug"
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-cyan-500 ${isCompact ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'}`}
                  />
                </div>
              </div>

              {registrationError && (
                <div className={`bg-rose-50 border border-rose-100 flex items-center gap-2 mb-4 ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}>
                  <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                  <p className={`text-rose-700 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{registrationError}</p>
                </div>
              )}

              <button
                onClick={handleRegister}
                disabled={isRegistering || !deviceId.trim()}
                className={`w-full bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-200 flex items-center justify-center gap-2 transition-all hover:bg-cyan-600 disabled:opacity-50 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
              >
                {isRegistering ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" /> Connecting...
                  </>
                ) : (
                  <>
                    <Plug className="w-5 h-5" /> Register Plug
                  </>
                )}
              </button>
            </div>

            {/* How to get Device ID */}
            <div className={`bg-amber-50 border border-amber-100 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className={`font-bold text-amber-800 mb-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>Where to find your Device ID?</h4>
                  <ol className={`text-amber-700 space-y-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                    <li>1. Set up your Wipro plug in the <strong>Tuya Smart</strong> or <strong>Smart Life</strong> app</li>
                    <li>2. Go to <strong>iot.tuya.com</strong> → Create a Cloud Project</li>
                    <li>3. Link your Tuya app account to the project</li>
                    <li>4. Find your plug under <strong>Devices</strong> → copy the Device ID</li>
                    <li>5. The Local Key is also visible on the device details page</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Existing Plugs */}
            {existingPlugs.length > 0 && (
              <div className="mt-6">
                <h3 className={`font-bold text-slate-800 mb-3 px-1 ${isCompact ? 'text-sm' : 'text-base'}`}>
                  Your Plugs ({existingPlugs.length})
                </h3>
                <div className="space-y-2">
                  {existingPlugs.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setDetailPlug(p)}
                      className={`w-full bg-white shadow-soft border border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`rounded-lg ${p.plug_status === 'online' ? 'bg-emerald-50' : 'bg-slate-100'} p-2`}>
                          <Plug className={`w-4 h-4 ${p.plug_status === 'online' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        </div>
                        <div className="text-left">
                          <p className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{p.name || 'Smart Plug'}</p>
                          <p className={`text-slate-400 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                            {p.linked_appliance ? `→ ${p.linked_appliance}` : 'Not linked'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.last_power_w != null && (
                          <span className={`font-bold text-cyan-600 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                            {p.last_power_w}W
                          </span>
                        )}
                        <div className={`w-2 h-2 rounded-full ${p.plug_status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-300'}`} />
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Step 2: Link to Appliance ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Success Banner */}
            <div className={`bg-emerald-50 border border-emerald-100 mb-6 text-center ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
              <div className={`rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-2 ${isCompact ? 'w-12 h-12' : 'w-14 h-14'}`}>
                <Check className={isCompact ? 'w-6 h-6' : 'w-7 h-7'} />
              </div>
              <h3 className={`font-bold text-emerald-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Plug Registered!</h3>
              <p className={`text-emerald-600 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                {plugStatus?.is_online ? '● Online — reading power data' : '○ Connecting...'}
              </p>
            </div>

            {/* Live Status (if available) */}
            {plugStatus?.is_online && (
              <div className={`bg-slate-900 text-white mb-6 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-slate-400 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>LIVE READING</span>
                  <button onClick={handleRefreshStatus} className="text-cyan-400 hover:text-cyan-300">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className={`font-bold text-cyan-400 ${isCompact ? 'text-lg' : 'text-xl'}`}>{plugStatus.power_w}W</p>
                    <p className={`text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Power</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-bold text-amber-400 ${isCompact ? 'text-lg' : 'text-xl'}`}>{plugStatus.voltage}V</p>
                    <p className={`text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Voltage</p>
                  </div>
                  <div className="text-center">
                    <p className={`font-bold text-emerald-400 ${isCompact ? 'text-lg' : 'text-xl'}`}>{plugStatus.current_ma}mA</p>
                    <p className={`text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>Current</p>
                  </div>
                </div>
              </div>
            )}

            {/* Link to Appliance */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <Link className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Link to Appliance</h3>
                  <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Which appliance is this plug monitoring?</p>
                </div>
              </div>

              <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                {appliances.filter(a => !a.smart_plug_id).map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedApplianceId(a.id)}
                    className={`w-full flex items-center gap-3 transition-all ${
                      selectedApplianceId === a.id
                        ? 'bg-cyan-50 border-cyan-300 ring-1 ring-cyan-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    } border ${isCompact ? 'rounded-lg p-2' : 'rounded-xl p-3'}`}
                  >
                    <span className={isCompact ? 'text-lg' : 'text-xl'}>
                      {a.icon === 'snowflake' ? '❄️' : a.icon === 'flame' ? '🔥' : a.icon === 'tv' ? '📺' : a.icon === 'fan' ? '🌀' : '⚡'}
                    </span>
                    <span className={`font-medium text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{a.name}</span>
                    {selectedApplianceId === a.id && (
                      <Check className="w-4 h-4 text-cyan-600 ml-auto" />
                    )}
                  </button>
                ))}
              </div>

              <button
                onClick={handleLinkAppliance}
                disabled={linking || !selectedApplianceId}
                className={`w-full bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:opacity-50 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
              >
                {linking ? (
                  <><RefreshCw className="w-5 h-5 animate-spin" /> Linking...</>
                ) : (
                  <><Link className="w-5 h-5" /> Link Appliance</>
                )}
              </button>

              <button
                onClick={() => setStep(3)}
                className={`w-full mt-2 text-slate-400 font-medium ${isCompact ? 'text-[10px] py-2' : 'text-xs py-3'}`}
              >
                Skip — I'll link later
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: Setup Complete — Live Data ── */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Success */}
            <div className={`bg-emerald-50 border border-emerald-100 mb-6 text-center ${isCompact ? 'rounded-2xl p-6' : 'rounded-[2rem] p-8'}`}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={`rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto mb-4 ${isCompact ? 'w-16 h-16' : 'w-20 h-20'}`}
              >
                <Check className={isCompact ? 'w-8 h-8' : 'w-10 h-10'} />
              </motion.div>
              <h2 className={`font-bold text-emerald-800 mb-2 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Setup Complete!</h2>
              <p className={`text-emerald-700 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                Your Wipro 16A plug is now monitoring
                {linkedAppliance ? ` your ${linkedAppliance}` : ' power usage'}
              </p>
            </div>

            {/* What happens next */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <h3 className={`font-bold text-slate-800 mb-4 ${isCompact ? 'text-sm' : 'text-base'}`}>What happens now?</h3>
              <div className="space-y-3">
                {[
                  { icon: Activity, color: 'text-cyan-600', bg: 'bg-cyan-50', title: 'Live Power Monitoring', desc: 'Real-time watts, voltage, and current every 10 seconds' },
                  { icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', title: 'Automatic Analytics', desc: 'Power history, daily/weekly trends, and cost tracking' },
                  { icon: Power, color: 'text-indigo-600', bg: 'bg-indigo-50', title: 'Remote Control', desc: 'Turn appliances on/off from the app — anywhere' },
                  { icon: Radio, color: 'text-emerald-600', bg: 'bg-emerald-50', title: 'Autopilot Ready', desc: 'Autopilot can verify commands and detect overrides' },
                ].map((item, idx) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-3"
                  >
                    <div className={`rounded-lg ${item.bg} p-2 flex-shrink-0`}>
                      <item.icon className={`w-4 h-4 ${item.color}`} />
                    </div>
                    <div>
                      <p className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{item.title}</p>
                      <p className={`text-slate-500 ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <button
              onClick={onBack}
              className={`w-full bg-slate-900 text-white font-bold shadow-lg flex items-center justify-center gap-2 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
            >
              Go to Dashboard <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SmartPlugSetup;
