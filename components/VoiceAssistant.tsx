import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Loader2, X, Play, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';

interface VoiceAssistantProps {
    homeId?: string;
}

// ── Synonym map for spoken names → appliance keywords ──
const SYNONYMS: Record<string, string[]> = {
    'ac': ['air conditioner', 'air conditioning', 'a c', 'a.c.', 'a.c', 'aircon'],
    'tv': ['television', 'tele vision', 'telivision', 'teli vision', 'tv'],
    'fan': ['ceiling fan', 'table fan', 'pedestal fan', 'fan'],
    'geyser': ['water heater', 'heater', 'gyser', 'geezer'],
    'refrigerator': ['fridge', 'refrigerator', 'ref'],
    'washing machine': ['washer', 'washing machine', 'washing'],
    'light': ['lighting', 'lights', 'lamp', 'bulb', 'tube light', 'tubelight'],
};

const VoiceAssistant: React.FC<VoiceAssistantProps> = ({ homeId }) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [appliances, setAppliances] = useState<any[]>([]);

    // Refs to avoid stale closures in speech recognition callbacks
    const recognitionRef = useRef<any>(null);
    const transcriptRef = useRef<string>('');
    const appliancesRef = useRef<any[]>([]);
    const homeIdRef = useRef<string | undefined>(homeId);

    // Keep refs in sync with state
    useEffect(() => { appliancesRef.current = appliances; }, [appliances]);
    useEffect(() => { homeIdRef.current = homeId; }, [homeId]);

    // Fetch appliances
    useEffect(() => {
        if (homeId) {
            const fetchAppliances = async () => {
                const { data, error } = await supabase
                    .from('appliances')
                    .select('id, name, category, is_controllable')
                    .eq('home_id', homeId)
                    .eq('is_active', true);
                if (!error && data) {
                    console.log('[VoiceAssistant] Loaded appliances:', data.map(a => a.name));
                    setAppliances(data);
                }
            };
            fetchAppliances();
        }
    }, [homeId]);

    // ── Find appliance by name or synonym ──
    const findAppliance = useCallback((cmd: string, appList: any[]) => {
        // Strip action words to isolate the appliance name portion
        const stripped = cmd
            .replace(/turn on|turn off|switch on|switch off|start|stop|schedule/gi, '')
            .replace(/\b(at|for|from|to|the|my|in|on|off)\b/gi, '')
            .replace(/\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/gi, '')
            .trim();

        console.log('[VoiceAssistant] Finding appliance in cmd:', cmd, '| stripped:', stripped, '| appliances:', appList.map(a => a.name));

        // Helper: check if a term appears as a whole word (not inside another word)
        const hasWholeWord = (text: string, word: string): boolean => {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
        };

        // 1. Direct name match (longest name first to prefer "Washing Machine" over "AC")
        const sortedByNameLength = [...appList].sort((a, b) => b.name.length - a.name.length);
        const directMatch = sortedByNameLength.find(a => cmd.includes(a.name.toLowerCase()));
        if (directMatch) { console.log('[VoiceAssistant] Direct match:', directMatch.name); return directMatch; }

        // 2. Synonym-based match (use word boundaries to prevent "ac" matching inside "machine")
        for (const appliance of sortedByNameLength) {
            const name = appliance.name.toLowerCase();
            for (const [key, synonyms] of Object.entries(SYNONYMS)) {
                const allTerms = [key, ...synonyms];
                // Check if any synonym term appears as a WHOLE WORD in the command
                const termMatchesCmd = allTerms.some(term =>
                    term.length <= 3 ? hasWholeWord(stripped, term) || hasWholeWord(cmd, term)
                        : stripped.includes(term) || cmd.includes(term)
                );
                if (termMatchesCmd) {
                    // Verify the appliance name matches this synonym group
                    if (hasWholeWord(name, key) || allTerms.some(t => name.includes(t))) {
                        console.log('[VoiceAssistant] Synonym match:', appliance.name, 'via', key);
                        return appliance;
                    }
                }
            }
        }

        // 3. Partial word match (e.g., "bedroom" matches "Bedroom AC") — words must be 4+ chars
        const words = stripped.split(/\s+/).filter(w => w.length > 3);
        for (const appliance of sortedByNameLength) {
            const name = appliance.name.toLowerCase();
            if (words.some(w => name.includes(w))) {
                console.log('[VoiceAssistant] Partial match:', appliance.name);
                return appliance;
            }
        }

        console.log('[VoiceAssistant] No match found');
        return null;
    }, []);

    // ── Parse time from spoken command ──
    const parseTime = useCallback((cmd: string): string | null => {
        // "9:00 p.m." / "9:00 pm" / "9:00pm" / "21:00"
        const match1 = cmd.match(/(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/i);
        if (match1) {
            let hours = parseInt(match1[1]);
            const mins = match1[2];
            const period = match1[3]?.replace(/\./g, '').toLowerCase();
            if (period === 'pm' && hours < 12) hours += 12;
            if (period === 'am' && hours === 12) hours = 0;
            return `${hours.toString().padStart(2, '0')}:${mins}`;
        }
        // "9 p.m." / "9 pm" / "9pm"
        const match2 = cmd.match(/(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)/i);
        if (match2) {
            let hours = parseInt(match2[1]);
            const period = match2[2].replace(/\./g, '').toLowerCase();
            if (period === 'pm' && hours < 12) hours += 12;
            if (period === 'am' && hours === 12) hours = 0;
            return `${hours.toString().padStart(2, '0')}:00`;
        }
        return null;
    }, []);

    // ── Process voice command ──
    const processCommand = useCallback(async (cmd: string) => {
        console.log('[VoiceAssistant] Processing command:', cmd);

        // Read fresh appliance data from ref
        const currentAppliances = appliancesRef.current;
        const currentHomeId = homeIdRef.current;

        console.log('[VoiceAssistant] Current appliances count:', currentAppliances.length);

        // 1. Identify Action
        let action: 'on' | 'off' | 'schedule' | null = null;
        if (cmd.includes('turn on') || cmd.includes('switch on') || cmd.includes('start')) action = 'on';
        else if (cmd.includes('turn off') || cmd.includes('switch off') || cmd.includes('stop')) action = 'off';
        else if (cmd.includes('schedule')) action = 'schedule';

        if (!action) {
            setStatus('error');
            setMessage('Action not recognized. Try "Turn on AC" or "Schedule TV at 9 PM".');
            return;
        }

        // 2. Identify Appliance
        const targetAppliance = findAppliance(cmd, currentAppliances);

        if (!targetAppliance) {
            const nameList = currentAppliances.map((a: any) => a.name).join(', ');
            setStatus('error');
            setMessage(`Appliance not found. Your appliances: ${nameList || 'none loaded'}`);
            return;
        }

        if (!targetAppliance.is_controllable) {
            setStatus('error');
            setMessage(`${targetAppliance.name} is not controllable.`);
            return;
        }

        // 3. Execute Action
        try {
            if (action === 'on' || action === 'off') {
                const { error } = await supabase
                    .from('appliances')
                    .update({ status: action === 'on' ? 'ON' : 'OFF', updated_at: new Date().toISOString() })
                    .eq('id', targetAppliance.id);

                if (error) throw error;

                await supabase.from('control_logs').insert({
                    appliance_id: targetAppliance.id,
                    action: action === 'on' ? 'turn_on' : 'turn_off',
                    trigger_source: 'voice',
                    result: 'success'
                });

                setStatus('success');
                setMessage(`Successfully turned ${action} ${targetAppliance.name}`);
            } else if (action === 'schedule') {
                const timeStr = parseTime(cmd);
                if (timeStr && currentHomeId) {
                    // DB schema: start_time (TIME), repeat_type (enum), custom_days (INT[])
                    const { error } = await supabase.from('schedules').insert({
                        home_id: currentHomeId,
                        appliance_id: targetAppliance.id,
                        start_time: timeStr,
                        repeat_type: 'daily',
                        is_active: true,
                        created_by: 'voice'
                    });
                    if (error) throw error;

                    await supabase.from('appliances')
                        .update({ status: 'SCHEDULED', schedule_time: timeStr })
                        .eq('id', targetAppliance.id);

                    setStatus('success');
                    setMessage(`Scheduled ${targetAppliance.name} for ${timeStr}`);
                } else {
                    setStatus('error');
                    setMessage('Could not detect time. Try: "Schedule TV at 9 PM"');
                }
            }
        } catch (err: any) {
            console.error('[VoiceAssistant] Error:', err);
            setStatus('error');
            setMessage(`Failed: ${err.message || 'Unknown error'}`);
        }

        setTimeout(() => setStatus('idle'), 4000);
    }, [findAppliance, parseTime]);

    // Keep a ref to the latest processCommand so onend always calls the fresh version
    const processCommandRef = useRef(processCommand);
    useEffect(() => { processCommandRef.current = processCommand; }, [processCommand]);

    // Initialize SpeechRecognition ONCE
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-IN';

        recognition.onresult = (event: any) => {
            const current = event.resultIndex;
            const text = event.results[current][0].transcript;
            setTranscript(text);
            transcriptRef.current = text;
        };

        recognition.onend = () => {
            setIsListening(false);
            const finalText = transcriptRef.current;
            if (finalText) {
                // Call the LATEST processCommand via ref
                processCommandRef.current(finalText.toLowerCase());
            } else {
                setStatus('idle');
            }
        };

        recognition.onerror = (event: any) => {
            console.error('[VoiceAssistant] Speech error:', event.error);
            setIsListening(false);
            setStatus('error');
            setMessage(event.error === 'not-allowed' ? 'Microphone access denied.' : 'Speech recognition error.');
        };

        recognitionRef.current = recognition;
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
        } else {
            setTranscript('');
            transcriptRef.current = '';
            setMessage('');
            setStatus('listening');
            setIsListening(true);
            recognitionRef.current?.start();
        }
    };

    return (
        <div className="fixed bottom-24 right-6 z-50">
            <AnimatePresence>
                {status !== 'idle' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={`absolute bottom-full mb-4 right-0 w-72 p-3 rounded-2xl shadow-xl border bg-white ${status === 'error' ? 'border-rose-100' : status === 'success' ? 'border-emerald-100' : 'border-indigo-100'}`}
                    >
                        <div className="flex items-start gap-2">
                            {status === 'listening' && <Loader2 className="w-4 h-4 text-primary animate-spin mt-1" />}
                            {status === 'processing' && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin mt-1" />}
                            {status === 'success' && <Play className="w-4 h-4 text-emerald-500 mt-1" />}
                            {status === 'error' && <Info className="w-4 h-4 text-rose-500 mt-1" />}
                            <div className="flex-1">
                                <p className="text-xs font-bold text-slate-800">
                                    {status === 'listening' ? 'Listening...' : status === 'processing' ? 'Processing...' : status === 'success' ? 'Success' : 'Error'}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5 italic min-h-[1rem]">
                                    {transcript || (status === 'listening' ? 'Say something...' : '')}
                                </p>
                                {message && <p className={`text-[10px] font-medium mt-1 ${status === 'error' ? 'text-rose-500' : 'text-emerald-600'}`}>{message}</p>}
                            </div>
                            <button onClick={() => setStatus('idle')} className="p-1"><X className="w-3 h-3 text-slate-300" /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={toggleListening}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${isListening
                    ? 'bg-rose-500 text-white shadow-rose-200 animate-pulse'
                    : 'bg-white text-primary border border-slate-100 shadow-soft hover:bg-slate-50'
                    }`}
            >
                <Mic className="w-6 h-6" />
            </motion.button>
        </div>
    );
};

export default VoiceAssistant;
