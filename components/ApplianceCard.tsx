
import React, { useState } from 'react';
import { Appliance, ApplianceStatus } from '../types';
import { Power, Clock, AlertTriangle, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: Appliance;
    compact?: boolean;
    onToggle?: (id: string, newStatus: boolean) => void;
}

// --- Custom Animated Icons ---

const AcIcon: React.FC<{ isOn: boolean }> = ({ isOn }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8h20" />
        <path d="M4 12h16" />
        <path d="M6 16h12" />
        {/* Wind Lines Animation */}
        <AnimatePresence>
            {isOn && (
                <>
                    <motion.path
                        d="M20 9l3 0" stroke="currentColor" strokeWidth="1.5"
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 5, opacity: [0, 1, 0] }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.path
                        d="M20 13l2 0" stroke="currentColor" strokeWidth="1.5"
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 5, opacity: [0, 1, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, delay: 0.3, ease: "linear" }}
                    />
                    <motion.path
                        d="M18 17l4 0" stroke="currentColor" strokeWidth="1.5"
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 5, opacity: [0, 1, 0] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: 0.1, ease: "linear" }}
                    />
                </>
            )}
        </AnimatePresence>
    </svg>
);

const GeyserIcon: React.FC<{ isOn: boolean; isHovered?: boolean }> = ({ isOn, isHovered = false }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
        {/* Animated Fill */}
        <motion.path
            d="M14 14.54a4 4 0 1 1-4 0V12h4v2.54Z"
            fill={isOn || isHovered ? "#f43f5e" : "transparent"}
            stroke="none"
            initial={{ scaleY: 0, originY: 1 }}
            animate={{ scaleY: isOn || isHovered ? 1 : 0 }}
            transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
        />
        <motion.line
            x1="12" y1="9" x2="12" y2="15"
            initial={{ opacity: 1 }}
            animate={{ opacity: isOn || isHovered ? 0 : 1 }}
        />
    </svg>
);

const FanIcon: React.FC<{ isOn: boolean }> = ({ isOn }) => (
    <motion.svg
        width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        animate={isOn ? { rotate: 360 } : { rotate: 0 }}
        transition={isOn ? { duration: 2, repeat: Infinity, ease: "linear" } : {}}
    >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 12v-4" />
        <path d="M12 12l3.46 2" />
        <path d="M12 12l-3.46 2" />
    </motion.svg>
);

const FridgeIcon: React.FC<{ isOn: boolean }> = ({ isOn }) => (
    <motion.svg
        width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        animate={isOn ? { x: [0, 1, -1, 0] } : {}}
        transition={isOn ? { duration: 0.2, repeat: Infinity, repeatDelay: 3 } : {}}
    >
        <path d="M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
        <path d="M3 10h18" />
        <path d="M10 6h4" />
        <path d="M10 16h4" />
    </motion.svg>
);

const getCustomIcon = (iconName: string, isOn: boolean, isHovered: boolean = false) => {
    switch (iconName) {
        case 'wind': return <AcIcon isOn={isOn} />;
        case 'thermometer': return <GeyserIcon isOn={isOn} isHovered={isHovered} />;
        case 'disc': return <FanIcon isOn={isOn} />; // Reusing Fan/Disc logic
        case 'box': return <FridgeIcon isOn={isOn} />;
        default: return <Power className="w-6 h-6" />;
    }
};

const ApplianceCard: React.FC<Props> = ({ data, compact = false, onToggle }) => {
    const [isOn, setIsOn] = useState(data.status === ApplianceStatus.ON || data.status === ApplianceStatus.WARNING);
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleTime, setScheduleTime] = useState(data.scheduleTime || "06:00");
    const [hasSchedule, setHasSchedule] = useState(data.status === ApplianceStatus.SCHEDULED);
    // Hover state specifically for micro-interaction
    const [isHovered, setIsHovered] = useState(false);
    const [isToggling, setIsToggling] = useState(false);

    // Sync local state when prop changes (from realtime updates)
    React.useEffect(() => {
        setIsOn(data.status === ApplianceStatus.ON || data.status === ApplianceStatus.WARNING);
    }, [data.status]);

    const isWarning = data.status === ApplianceStatus.WARNING;

    const handleToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isToggling) return;
        const newStatus = !isOn;
        setIsToggling(true);
        setIsOn(newStatus); // Optimistic update
        if (onToggle) {
            await onToggle(data.id, newStatus);
        }
        setIsToggling(false);
    };

    const toggleScheduleMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsScheduling(!isScheduling);
    };

    const handleSetSchedule = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHasSchedule(true);
        setIsScheduling(false);
    };

    const handleCancelSchedule = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsScheduling(false);
    };

    // Combine actual On state with Hover state for the animation trigger
    const animationState = isOn || isHovered;

    return (
        <motion.div
            layout={!compact}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            whileHover={compact ? {} : { y: -4, boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.1)" }}
            whileTap={compact ? {} : { scale: 0.98 }}
            className={`
        relative border bg-white flex flex-col justify-between aspect-square overflow-hidden cursor-pointer
        ${compact ? 'p-3 rounded-xl' : 'p-4 rounded-[1.5rem]'}
        ${isOn ? (isWarning ? 'border-rose-100 shadow-rose-100' : 'border-slate-100 shadow-soft') : 'border-slate-50 opacity-100'}
      `}
        >
            {/* Background Gradient for Active State */}
            <AnimatePresence>
                {isOn && !isWarning && !isScheduling && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-gradient-to-br from-cyan-50/50 to-transparent pointer-events-none"
                    />
                )}
                {isWarning && !isScheduling && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-gradient-to-br from-rose-50/50 to-transparent pointer-events-none"
                    />
                )}
                {isScheduling && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-slate-50 z-20"
                    />
                )}
            </AnimatePresence>

            {/* Regular View */}
            {!isScheduling ? (
                <>
                    <div className="flex justify-between items-start z-10">
                        <motion.div
                            animate={isOn ? { backgroundColor: isWarning ? '#fff1f2' : '#ecfeff', color: isWarning ? '#f43f5e' : '#0891b2' } : { backgroundColor: '#f1f5f9', color: '#94a3b8' }}
                            className={`rounded-xl flex items-center justify-center transition-colors duration-300 ${compact ? 'w-8 h-8' : 'w-12 h-12 rounded-2xl'}`}
                        >
                            {getCustomIcon(data.icon, animationState, isHovered)}
                        </motion.div>

                        <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
                            {/* Schedule Button */}
                            <motion.button
                                whileTap={compact ? {} : { scale: 0.9 }}
                                onClick={toggleScheduleMode}
                                className={`rounded-full bg-slate-100 text-slate-400 flex items-center justify-center hover:bg-slate-200 transition-colors ${compact ? 'w-6 h-6' : 'w-8 h-8'}`}
                            >
                                <Clock className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                            </motion.button>

                            {/* Power Toggle */}
                            <motion.button
                                whileTap={compact ? {} : { scale: 0.9 }}
                                onClick={handleToggle}
                                className={`rounded-full flex items-center justify-center transition-colors duration-300 ${compact ? 'w-6 h-6' : 'w-8 h-8'} ${isOn ? (isWarning ? 'bg-rose-500 text-white' : 'bg-slate-900 text-white') : 'bg-slate-200 text-slate-400'}`}
                            >
                                <Power className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                            </motion.button>
                        </div>
                    </div>

                    <div className={`z-10 ${compact ? 'mt-1' : 'mt-2'}`}>
                        <h3 className={`font-bold text-slate-800 leading-tight mb-1 line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>{data.name}</h3>

                        <AnimatePresence mode='wait'>
                            {isOn ? (
                                <motion.div
                                    key="on"
                                    initial={compact ? false : { opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={compact ? {} : { opacity: 0, y: -5 }}
                                    className="flex flex-col"
                                >
                                    <div className={`flex items-center gap-1 ${compact ? 'mb-0' : 'mb-1'}`}>
                                        <span className={`font-bold ${isWarning ? 'text-rose-500' : 'text-cyan-600'} ${compact ? 'text-[10px]' : 'text-xs'}`}>
                                            {data.power}W
                                        </span>
                                        <span className={`rounded-full bg-slate-300 ${compact ? 'w-0.5 h-0.5' : 'w-1 h-1'}`}></span>
                                        <span className={`text-slate-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>Running</span>
                                    </div>
                                    {isWarning && !compact && (
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-rose-500 bg-rose-100/50 px-2 py-1 rounded-lg self-start">
                                            <AlertTriangle className="w-3 h-3" /> Peak Rate
                                        </div>
                                    )}
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="off"
                                    initial={compact ? false : { opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={compact ? {} : { opacity: 0, y: -5 }}
                                >
                                    {hasSchedule ? (
                                        <div className={`flex items-center gap-1 font-medium text-indigo-500 bg-indigo-50 rounded-lg self-start inline-flex ${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-xs px-2 py-1'}`}>
                                            <Clock className={compact ? 'w-2 h-2' : 'w-3 h-3'} /> {scheduleTime}
                                        </div>
                                    ) : (
                                        <p className={`text-slate-400 font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>Device is idle</p>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Progress Bar Decoration */}
                    {isOn && !compact && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: isWarning ? '90%' : '40%' }}
                                transition={{ duration: 1.5, delay: 0.2 }}
                                className={`h-full ${isWarning ? 'bg-rose-500' : 'bg-cyan-500'}`}
                            />
                        </div>
                    )}
                </>
            ) : (
                // Schedule Mode View
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="z-30 w-full h-full flex flex-col justify-between"
                >
                    <div className="flex justify-between items-center mb-1">
                        <span className={`font-bold uppercase text-slate-400 tracking-wider ${compact ? 'text-[9px]' : 'text-xs'}`}>Schedule</span>
                        <button onClick={handleCancelSchedule} className={`bg-slate-100 rounded-full text-slate-500 ${compact ? 'p-0.5' : 'p-1'}`}>
                            <X className={compact ? 'w-3 h-3' : 'w-4 h-4'} />
                        </button>
                    </div>

                    <div className={`flex-1 flex flex-col justify-center ${compact ? 'gap-1' : 'gap-2'}`}>
                        <label className={`font-medium text-slate-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>Run Daily At:</label>
                        <div className={`flex items-center gap-2 bg-white border border-slate-200 shadow-sm ${compact ? 'rounded-lg p-1.5' : 'rounded-xl p-2'}`}>
                            <Clock className={`text-indigo-500 ${compact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                            <input
                                type="time"
                                value={scheduleTime}
                                onChange={(e) => setScheduleTime(e.target.value)}
                                className={`bg-transparent text-slate-800 font-bold outline-none w-full ${compact ? 'text-sm' : 'text-lg'}`}
                            />
                        </div>
                        {!compact && (
                            <div className="flex items-center gap-1 mt-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                <span className="text-[10px] text-slate-400">Off-Peak window active</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleSetSchedule}
                        className={`w-full bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-1 ${compact ? 'py-1.5 rounded-lg text-[10px] mt-1' : 'py-2 rounded-xl text-sm mt-2'}`}
                    >
                        <Check className={compact ? 'w-3 h-3' : 'w-4 h-4'} /> Set Schedule
                    </button>
                </motion.div>
            )}
        </motion.div>
    );
};

export default ApplianceCard;
