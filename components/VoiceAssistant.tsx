import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { toggleAppliance as apiToggle, createSchedule } from '../services/backend';

interface VoiceAssistantProps {
    homeId?: string;
    viewMode?: 'mobile' | 'tablet' | 'web';
}

interface VoiceAppliance {
    id: string;
    name: string;
    category: string;
    is_controllable: boolean;
}

/** English, Hindi (transliterated + Devanagari), Bengali (transliterated + Bengali script) */
const SYNONYMS: Record<string, string[]> = {
    ac: [
        'air conditioner', 'air conditioning', 'a c', 'aircon', 'ac unit',
        'एसी', 'এসি',
    ],
    refrigerator: [
        'fridge', 'freezer', 'ref', 'refrigerator',
        'फ्रिज', 'ফ্রিজ',
    ],
    fan: [
        'ceiling fan', 'table fan', 'pedestal fan', 'fan',
        'पंखा', 'pankha', 'পাখা', 'pakha', 'ফ্যান', 'phan',
    ],
    lighting: [
        'light', 'lighting', 'lights', 'lamp', 'bulb', 'tube light', 'tubelight',
        'बल्ब', 'लाइट', 'আলো', 'লাইট',
    ],
    tv: ['television', 'tele vision', 'telivision', 'टीवी', 'টিভি'],
    geyser: ['water heater', 'heater', 'gyser', 'geezer', 'geyzer', 'गीजर', 'গিজার'],
    'washing machine': ['washer', 'washing machine', 'washing', 'वॉशिंग मशीन'],
};

const ON_COMMAND =
    /turn\s+on|switch\s+on|start|activate|on\s+karo|chalu\s+karo|chalu|jalao|kholo|open|chalu\s+koro|on\s+koro/i;

const OFF_COMMAND =
    /turn\s+off|switch\s+off|stop|deactivate|band\s+karo|off\s+karo|band|bandh|close|bondho\s+koro|off\s+koro/i;

const SCHEDULE_COMMAND = /schedule|set|timer|time\s+pe|baje/i;

const COMMAND_STRIP =
    /turn\s+on|turn\s+off|switch\s+on|switch\s+off|start|stop|activate|deactivate|schedule|set|timer|time\s+pe|baje|on\s+karo|off\s+karo|chalu\s+karo|chalu\s+koro|bondho\s+koro|band\s+karo|chalu|jalao|kholo|open|band|bandh|close/gi;

const ACTION_DETECT =
    /turn\s+on|turn\s+off|switch\s+on|switch\s+off|start|stop|schedule|band|chalu|jalao|bondho|on\s+karo|off\s+koro|band\s+karo|activate|deactivate/i;

const normalizeTranscript = (text: string): string =>
    text.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

const parseVoiceAction = (cmd: string): 'on' | 'off' | 'schedule' | null => {
    if (ON_COMMAND.test(cmd)) return 'on';
    if (OFF_COMMAND.test(cmd)) return 'off';
    if (SCHEDULE_COMMAND.test(cmd)) return 'schedule';
    return null;
};

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ homeId, viewMode = 'mobile' }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [appliances, setAppliances] = useState<VoiceAppliance[]>([]);
    const [isSupported, setIsSupported] = useState(true);
    const [volumeLevel, setVolumeLevel] = useState(0);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const transcriptRef = useRef('');
    const appliancesRef = useRef<VoiceAppliance[]>([]);
    const homeIdRef = useRef<string | undefined>(homeId);
    const isListeningRef = useRef(false);
    const shouldRestartRef = useRef(false);
    const commandHandledRef = useRef(false);
    const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { appliancesRef.current = appliances; }, [appliances]);
    useEffect(() => { homeIdRef.current = homeId; }, [homeId]);
    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

    const fetchAppliances = useCallback(async (): Promise<VoiceAppliance[]> => {
        if (!homeIdRef.current) return [];
        try {
            const { data, error } = await supabase
                .from('appliances')
                .select('id, name, category, is_controllable')
                .eq('home_id', homeIdRef.current)
                .eq('is_active', true);
            if (!error && data) {
                console.log('[Voice] Appliances refreshed:', data.map(a => a.name));
                setAppliances(data);
                appliancesRef.current = data;
                return data;
            }
        } catch (err) {
            console.warn('[Voice] fetchAppliances failed:', err);
        }
        return appliancesRef.current;
    }, []);

    useEffect(() => {
        if (homeId) fetchAppliances();
    }, [homeId, fetchAppliances]);

    const transcriptMentionsDevice = useCallback((text: string, appList: VoiceAppliance[]): boolean => {
        const cmd = normalizeTranscript(text);
        if (appList.some(a => cmd.includes(a.name.toLowerCase()))) return true;
        return appList.some(appliance => {
            const name = appliance.name.toLowerCase();
            const category = (appliance.category || '').toLowerCase();
            return Object.entries(SYNONYMS).some(([key, synonyms]) => {
                const terms = [key, ...synonyms];
                const hit = terms.some(t =>
                    t.length <= 3 ? new RegExp(`\\b${t}\\b`, 'i').test(cmd) : cmd.includes(t.toLowerCase())
                );
                return hit && (name.includes(key) || category.includes(key) || terms.some(t => name.includes(t.toLowerCase())));
            });
        });
    }, []);

    const findAppliance = useCallback((cmd: string, appList: VoiceAppliance[]): VoiceAppliance | null => {
        const normalized = normalizeTranscript(cmd);
        const stripped = normalized
            .replace(COMMAND_STRIP, '')
            .replace(/\b(at|for|from|to|the|my|in)\b/gi, '')
            .replace(/\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/gi, '')
            .trim();

        const hasWord = (text: string, word: string) =>
            new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

        const sorted = [...appList].sort((a, b) => b.name.length - a.name.length);

        const direct = sorted.find(a => normalized.includes(a.name.toLowerCase()));
        if (direct) return direct;

        for (const appliance of sorted) {
            const name = appliance.name.toLowerCase();
            const category = (appliance.category || '').toLowerCase();
            for (const [key, synonyms] of Object.entries(SYNONYMS)) {
                const terms = [key, ...synonyms];
                const hit = terms.some(t => {
                    const term = t.toLowerCase();
                    return term.length <= 3
                        ? hasWord(stripped, term) || hasWord(normalized, term)
                        : stripped.includes(term) || normalized.includes(term);
                });
                if (hit && (hasWord(name, key) || category.includes(key) || terms.some(t => name.includes(t.toLowerCase())))) {
                    return appliance;
                }
            }
        }

        const words = stripped.split(/\s+/).filter(w => w.length > 2);
        return sorted.find(a => words.some(w => a.name.toLowerCase().includes(w))) ?? null;
    }, []);

    const parseTime = useCallback((cmd: string): string | null => {
        const m1 = cmd.match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i);
        if (m1) {
            let h = parseInt(m1[1]);
            const period = m1[3]?.replace(/\./g, '').toLowerCase();
            if (period === 'pm' && h < 12) h += 12;
            if (period === 'am' && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:${m1[2]}`;
        }
        const m2 = cmd.match(/(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)/i);
        if (m2) {
            let h = parseInt(m2[1]);
            const period = m2[2].replace(/\./g, '').toLowerCase();
            if (period === 'pm' && h < 12) h += 12;
            if (period === 'am' && h === 12) h = 0;
            return `${String(h).padStart(2, '0')}:00`;
        }
        return null;
    }, []);

    const processCommand = useCallback(async (rawCmd: string) => {
        const cmd = normalizeTranscript(rawCmd);
        if (!cmd) return;
        console.log('[Voice] Processing:', cmd);
        commandHandledRef.current = true;
        setStatus('processing');

        let appl: VoiceAppliance[];
        try {
            appl = await fetchAppliances();
        } catch {
            setStatus('error');
            setMessage('Could not load devices. Check your connection and try again.');
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
            return;
        }

        const hid = homeIdRef.current;
        const action = parseVoiceAction(cmd);

        if (!action) {
            setStatus('error');
            setMessage('Action not recognized. Try "Turn on AC", "AC chalu karo", or "এসি on koro"');
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 4000);
            return;
        }

        const target = findAppliance(cmd, appl);
        if (!target) {
            setStatus('error');
            setMessage(`Device not found. Your devices: ${appl.map(a => a.name).join(', ') || 'none'}`);
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
            return;
        }
        if (!target.is_controllable) {
            setStatus('error');
            setMessage(`${target.name} is not controllable.`);
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 4000);
            return;
        }

        try {
            if (action === 'on' || action === 'off') {
                const apiAction = action === 'on' ? 'turn_on' : 'turn_off';
                const result = await apiToggle(target.id, apiAction);
                if (!result.success) {
                    throw new Error(result.message || 'Toggle failed');
                }
                setStatus('success');
                setMessage(`✅ ${target.name} turned ${action}`);
            } else {
                const timeStr = parseTime(cmd);
                if (timeStr && hid) {
                    await createSchedule(target.id, timeStr, null, 'daily');
                    setStatus('success');
                    setMessage(`✅ ${target.name} scheduled for ${timeStr}`);
                } else {
                    setStatus('error');
                    setMessage('Could not detect time. Try: "Schedule AC at 9 PM"');
                }
            }
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            const isNetwork = /fetch|network|failed to fetch|timeout|connection|aborted/i.test(errMsg);
            const isPermission = /permission denied|42501|service_role/i.test(errMsg);
            setStatus('error');
            setMessage(
                isPermission
                    ? 'Server permission error. Ensure backend uses the Supabase service_role key.'
                    : isNetwork
                        ? 'Backend unreachable. Start the API on port 8000 and try again.'
                        : `Failed: ${errMsg}`,
            );
        }
        setTimeout(() => {
            setStatus('idle');
            setMessage('');
            setTranscript('');
            transcriptRef.current = '';
        }, 5000);
    }, [findAppliance, parseTime, fetchAppliances]);

    const processCommandRef = useRef(processCommand);
    useEffect(() => { processCommandRef.current = processCommand; }, [processCommand]);

    useEffect(() => {
        const SR = window.SpeechRecognition
            || (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
        if (!SR) {
            setIsSupported(false);
            return;
        }

        const r = new SR();
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 3;
        r.lang = 'en-IN';

        r.onresult = (event: SpeechRecognitionEvent) => {
            setVolumeLevel(0.8);
            if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
            volumeTimerRef.current = setTimeout(() => setVolumeLevel(0), 600);

            let interimText = '';
            let newFinal = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const res = event.results[i];
                if (res.isFinal) {
                    newFinal += res[0].transcript + ' ';
                    transcriptRef.current = (transcriptRef.current + ' ' + res[0].transcript).trim();
                } else {
                    interimText = res[0].transcript;
                }
            }

            setTranscript(transcriptRef.current || interimText);

            if (newFinal.trim()) {
                const combined = normalizeTranscript(transcriptRef.current);
                if (ACTION_DETECT.test(combined)) {
                    const hasDevice =
                        appliancesRef.current.length === 0
                        || transcriptMentionsDevice(combined, appliancesRef.current);
                    if (hasDevice) {
                        console.log('[Voice] Auto command detected:', combined);
                        shouldRestartRef.current = false;
                        r.stop();
                        void processCommandRef.current(combined);
                    }
                }
            }
        };

        r.onend = () => {
            if (shouldRestartRef.current && isListeningRef.current) {
                setTimeout(() => {
                    try { r.start(); } catch { /* already running */ }
                }, 100);
            } else {
                setIsListening(false);
                setVolumeLevel(0);
                const pending = transcriptRef.current.trim();
                if (pending && !commandHandledRef.current) {
                    void processCommandRef.current(pending);
                }
                commandHandledRef.current = false;
            }
        };

        r.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[Voice] onerror:', event.error);
            if (['no-speech', 'aborted', 'phrases-not-supported'].includes(event.error)) return;

            shouldRestartRef.current = false;
            setIsListening(false);
            setVolumeLevel(0);

            const msgs: Record<string, string> = {
                'not-allowed': '🎤 Mic blocked — allow microphone in browser settings.',
                network: '🌐 Network error reaching speech service.',
                'audio-capture': '🎤 No microphone detected.',
                'service-not-allowed': '🔒 Speech requires HTTPS or localhost.',
            };
            setStatus('error');
            setMessage(msgs[event.error] ?? `Error: ${event.error}`);
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 6000);
        };

        recognitionRef.current = r;
    }, [transcriptMentionsDevice]);

    const toggleListening = () => {
        if (isListening) {
            shouldRestartRef.current = false;
            const pending = transcriptRef.current.trim();
            try { recognitionRef.current?.stop(); } catch { /* noop */ }
            if (!pending) {
                setIsListening(false);
                setStatus('idle');
                setMessage('');
                setTranscript('');
                transcriptRef.current = '';
                setVolumeLevel(0);
            }
        } else {
            if (appliances.length === 0 && homeId) {
                setStatus('error');
                setMessage('No devices found. Add appliances in Control first.');
                setTimeout(() => { setStatus('idle'); setMessage(''); }, 6000);
                return;
            }
            transcriptRef.current = '';
            commandHandledRef.current = false;
            setTranscript('');
            setMessage('');
            setStatus('listening');
            setIsListening(true);
            shouldRestartRef.current = true;
            try {
                recognitionRef.current?.start();
            } catch (err: unknown) {
                console.warn('[Voice] start error:', err instanceof Error ? err.message : err);
                setStatus('error');
                setMessage('Could not start microphone. Use Chrome or Edge.');
                setIsListening(false);
                setTimeout(() => { setStatus('idle'); setMessage(''); }, 5000);
            }
        }
    };

    if (!isSupported) return null;

    return (
        <div className={`absolute z-[54] right-4 ${viewMode === 'mobile' ? 'bottom-44' : 'bottom-40'}`}>
            <AnimatePresence>
                {status !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.95 }}
                        className={`absolute bottom-full mb-3 right-0 w-72 rounded-2xl shadow-xl bg-white border overflow-hidden
                            ${status === 'error' ? 'border-rose-100' : status === 'success' ? 'border-emerald-100' : 'border-indigo-100'}`}
                    >
                        <div className={`px-3 py-2 flex items-center justify-between
                            ${status === 'listening' ? 'bg-indigo-50' : status === 'success' ? 'bg-emerald-50' : status === 'error' ? 'bg-rose-50' : 'bg-slate-50'}`}>
                            <div className="flex items-center gap-2">
                                {status === 'listening' && <Mic className="w-3.5 h-3.5 text-indigo-500" />}
                                {status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />}
                                {status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                {status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-500" />}
                                <span className={`text-xs font-bold
                                    ${status === 'listening' ? 'text-indigo-700'
                                        : status === 'success' ? 'text-emerald-700'
                                            : status === 'error' ? 'text-rose-700'
                                                : 'text-slate-700'}`}>
                                    {status === 'listening' ? 'Listening...'
                                        : status === 'processing' ? 'Processing...'
                                            : status === 'success' ? 'Done!'
                                                : 'Notice'}
                                </span>
                            </div>
                            <button type="button" onClick={() => { setStatus('idle'); setMessage(''); }} className="p-0.5 rounded-full hover:bg-black/5">
                                <X className="w-3 h-3 text-slate-400" />
                            </button>
                        </div>

                        <div className="px-3 py-2.5 space-y-2">
                            {status === 'listening' && (
                                <div className="flex items-center gap-1 h-5">
                                    {[...Array(12)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{ height: volumeLevel > 0 ? `${Math.random() * 14 + 4}px` : '4px' }}
                                            transition={{ duration: 0.15, delay: i * 0.02 }}
                                            className={`flex-1 rounded-full ${volumeLevel > 0 ? 'bg-indigo-400' : 'bg-slate-200'}`}
                                        />
                                    ))}
                                </div>
                            )}

                            {(transcript || status === 'listening') && (
                                <p className="text-[11px] text-slate-600 italic min-h-[1rem]">
                                    &ldquo;{transcript || 'Say something...'}&rdquo;
                                </p>
                            )}

                            {message && (
                                <p className={`text-[11px] font-medium ${status === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {message}
                                </p>
                            )}

                            {status === 'listening' && (
                                <p className="text-[10px] text-slate-400">
                                    {transcript
                                        ? <span className="text-indigo-600 font-medium">Tap mic again to run command</span>
                                        : (
                                            <>
                                                EN/HI/BN: <span className="font-medium text-slate-500">&quot;Turn on AC&quot;</span>
                                                {' · '}
                                                <span className="font-medium text-slate-500">&quot;AC chalu karo&quot;</span>
                                            </>
                                        )}
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                type="button"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleListening}
                title="Voice Assistant"
                className={`flex items-center justify-center rounded-[20px] border shadow-xl transition-all duration-300
                    ${viewMode === 'mobile' ? 'w-14 h-14' : 'w-11 h-11'}
                    ${isListening
                        ? 'bg-rose-500 text-white border-rose-600 shadow-rose-300 animate-pulse'
                        : 'bg-slate-900 text-white border-slate-700 shadow-slate-300 hover:scale-110'}`}
            >
                {isListening
                    ? <MicOff className={viewMode === 'mobile' ? 'w-7 h-7' : 'w-5 h-5'} />
                    : <Mic className={viewMode === 'mobile' ? 'w-7 h-7' : 'w-5 h-5'} />}
            </motion.button>
        </div>
    );
};

export default VoiceAssistant;
