import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { toggleAppliance, createSchedule } from '../services/backend';

interface VoiceAssistantProps {
    homeId?: string;
    viewMode?: 'mobile' | 'tablet' | 'web';
}

const SYNONYMS: Record<string, string[]> = {
    'ac': ['air conditioner', 'air conditioning', 'a c', 'aircon', 'ac unit'],
    'tv': ['television', 'tele vision', 'telivision'],
    'fan': ['ceiling fan', 'table fan', 'pedestal fan'],
    'geyser': ['water heater', 'heater', 'gyser', 'geezer', 'geyzer'],
    'refrigerator': ['fridge', 'freezer', 'ref'],
    'washing machine': ['washer', 'washing machine', 'washing'],
    'light': ['lighting', 'lights', 'lamp', 'bulb', 'tube light', 'tubelight'],
};

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ homeId, viewMode = 'mobile' }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [appliances, setAppliances] = useState<any[]>([]);
    const [isSupported, setIsSupported] = useState(true);
    const [volumeLevel, setVolumeLevel] = useState(0); // 0-1 for animated mic bar

    const recognitionRef = useRef<any>(null);
    const transcriptRef = useRef('');
    const appliancesRef = useRef<any[]>([]);
    const homeIdRef = useRef<string | undefined>(homeId);
    const isListeningRef = useRef(false);
    const shouldRestartRef = useRef(false);
    const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { appliancesRef.current = appliances; }, [appliances]);
    useEffect(() => { homeIdRef.current = homeId; }, [homeId]);
    useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

    // Fetch (or re-fetch) appliances — called on mount AND before each command
    const fetchAppliances = useCallback(async () => {
        if (!homeIdRef.current) return [];
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
        return appliancesRef.current;
    }, []);

    useEffect(() => {
        if (homeId) fetchAppliances();
    }, [homeId, fetchAppliances]);

    const findAppliance = useCallback((cmd: string, appList: any[]) => {
        const stripped = cmd
            .replace(/turn on|turn off|switch on|switch off|start|stop|schedule|band|chalu/gi, '')
            .replace(/\b(at|for|from|to|the|my|in|on|off)\b/gi, '')
            .replace(/\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/gi, '')
            .trim();

        const hasWord = (text: string, word: string) =>
            new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

        const sorted = [...appList].sort((a, b) => b.name.length - a.name.length);

        // 1. Direct name
        const direct = sorted.find(a => cmd.includes(a.name.toLowerCase()));
        if (direct) return direct;

        // 2. Synonym
        for (const appliance of sorted) {
            const name = appliance.name.toLowerCase();
            for (const [key, synonyms] of Object.entries(SYNONYMS)) {
                const terms = [key, ...synonyms];
                const hit = terms.some(t =>
                    t.length <= 3 ? hasWord(stripped, t) || hasWord(cmd, t) : stripped.includes(t) || cmd.includes(t)
                );
                if (hit && (hasWord(name, key) || terms.some(t => name.includes(t)))) return appliance;
            }
        }

        // 3. Partial word (4+ chars)
        const words = stripped.split(/\s+/).filter(w => w.length > 3);
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

    const processCommand = useCallback(async (cmd: string) => {
        console.log('[Voice] Processing:', cmd);
        setStatus('processing');

        // Re-fetch fresh appliance list right before searching
        const appl = await fetchAppliances();
        const hid = homeIdRef.current;

        let action: 'on' | 'off' | 'schedule' | null = null;
        if (/turn on|switch on|start|on karo|chalu|kholo|open/i.test(cmd)) action = 'on';
        else if (/turn off|switch off|stop|band|off karo|bandh|close/i.test(cmd)) action = 'off';
        else if (/schedule|set|timer|time pe|baje/i.test(cmd)) action = 'schedule';

        if (!action) {
            setStatus('error');
            setMessage('Action not recognized. Try "Turn on AC" or "Schedule fan at 9 PM"');
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
                // ✅ Use the same backend API as manual toggle (Tuya-aware, proper auth)
                const apiAction = action === 'on' ? 'turn_on' : 'turn_off';
                const result = await toggleAppliance(target.id, apiAction);
                setStatus('success');
                setMessage(`✅ ${target.name} turned ${action}`);
            } else {
                const timeStr = parseTime(cmd);
                if (timeStr && hid) {
                    // ✅ Use backend createSchedule so APScheduler registers the job
                    await createSchedule(target.id, timeStr, null, 'daily');
                    setStatus('success');
                    setMessage(`✅ ${target.name} scheduled for ${timeStr}`);
                } else {
                    setStatus('error');
                    setMessage('Could not detect time. Try: "Schedule AC at 9 PM"');
                }
            }
        } catch (err: any) {
            setStatus('error');
            setMessage(`Failed: ${err.message || 'Unknown error'}`);
        }
        setTimeout(() => { setStatus('idle'); setMessage(''); setTranscript(''); transcriptRef.current = ''; }, 5000);
    }, [findAppliance, parseTime]);

    const processCommandRef = useRef(processCommand);
    useEffect(() => { processCommandRef.current = processCommand; }, [processCommand]);

    // Init SpeechRecognition — ONE time, no getUserMedia conflict
    useEffect(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { setIsSupported(false); return; }

        const r = new SR();
        r.continuous = true;      // keep listening through silence
        r.interimResults = true;  // show words in real-time
        r.maxAlternatives = 3;
        r.lang = 'en-IN';         // Indian English

        r.onresult = (event: any) => {
            // Animate volume level when speech comes in
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

            // Auto-stop when we detect a full command
            if (newFinal.trim()) {
                const combined = transcriptRef.current.toLowerCase();
                const hasAction = /turn on|turn off|switch on|switch off|start|stop|schedule|band|chalu/i.test(combined);
                const hasDevice = appliancesRef.current.some(a =>
                    combined.includes(a.name.toLowerCase()) ||
                    Object.values(SYNONYMS).flat().some(s => combined.includes(s))
                );
                if (hasAction && hasDevice) {
                    console.log('[Voice] Full command detected:', combined);
                    shouldRestartRef.current = false;
                    r.stop();
                    processCommandRef.current(combined);
                }
            }
        };

        r.onend = () => {
            console.log('[Voice] onend, shouldRestart:', shouldRestartRef.current);
            if (shouldRestartRef.current && isListeningRef.current) {
                // Keep alive — restart immediately
                setTimeout(() => {
                    try { r.start(); } catch (_) { }
                }, 100);
            } else {
                setIsListening(false);
                setVolumeLevel(0);
            }
        };

        r.onerror = (event: any) => {
            console.error('[Voice] onerror:', event.error);
            // Non-fatal — let onend restart
            if (['no-speech', 'aborted', 'phrases-not-supported'].includes(event.error)) return;

            // Fatal errors
            shouldRestartRef.current = false;
            setIsListening(false);
            setVolumeLevel(0);

            const msgs: Record<string, string> = {
                'not-allowed': '🎤 Mic blocked — click the mic icon in the address bar and allow.',
                'network': '🌐 Network error reaching speech service.',
                'audio-capture': '🎤 No microphone detected on this device.',
                'service-not-allowed': '🔒 Speech service requires a secure connection.',
            };
            setStatus('error');
            setMessage(msgs[event.error] ?? `Error: ${event.error}`);
            setTimeout(() => { setStatus('idle'); setMessage(''); }, 6000);
        };

        recognitionRef.current = r;
    }, []);

    const toggleListening = () => {
        if (isListening) {
            shouldRestartRef.current = false;
            try { recognitionRef.current?.stop(); } catch (_) { }
            setIsListening(false);
            setStatus('idle');
            setMessage('');
            setTranscript('');
            transcriptRef.current = '';
            setVolumeLevel(0);
        } else {
            transcriptRef.current = '';
            setTranscript('');
            setMessage('');
            setStatus('listening');
            setIsListening(true);
            shouldRestartRef.current = true;
            try {
                recognitionRef.current?.start();
            } catch (err: any) {
                console.warn('[Voice] start error:', err?.message);
                // Already running — likely fine
            }
        }
    };

    if (!isSupported) return null;

    return (
        // absolute inside the phone frame — sits above the lightning button (bottom-28)
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
                        {/* Top bar */}
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
                            <button onClick={() => { setStatus('idle'); setMessage(''); }} className="p-0.5 rounded-full hover:bg-black/5">
                                <X className="w-3 h-3 text-slate-400" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-3 py-2.5 space-y-2">
                            {/* Voice activity bar — animated when speech detected */}
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

                            {/* Live transcript */}
                            {(transcript || status === 'listening') && (
                                <p className="text-[11px] text-slate-600 italic min-h-[1rem]">
                                    &ldquo;{transcript || 'Say something...'}&rdquo;
                                </p>
                            )}

                            {/* Result */}
                            {message && (
                                <p className={`text-[11px] font-medium ${status === 'error' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {message}
                                </p>
                            )}

                            {/* Hint */}
                            {status === 'listening' && !transcript && (
                                <p className="text-[10px] text-slate-400">
                                    Try: <span className="font-medium text-slate-500">"Turn on AC"</span> or <span className="font-medium text-slate-500">"Schedule fan at 9 PM"</span>
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mic Button — styled to match FloatingOptimizeButton */}
            <motion.button
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
