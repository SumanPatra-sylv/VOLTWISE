import React, { useState } from 'react';
import { ArrowLeft, Wifi, QrCode, Check, Zap, Radio, RefreshCw, Smartphone, Plug, ChevronRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tab } from '../types';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  viewMode?: ViewMode;
}

const SmartPlugSetup: React.FC<Props> = ({ onBack, viewMode = 'mobile' }) => {
  const [step, setStep] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [deviceFound, setDeviceFound] = useState(false);
  const [wifiConnected, setWifiConnected] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  
  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  const handleScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setDeviceFound(true);
    }, 2000);
  };

  const handleWifiConnect = () => {
    setTimeout(() => {
      setWifiConnected(true);
      setStep(3);
    }, 1500);
  };

  const handleCalibration = () => {
    setCalibrating(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setCalibrationProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setCalibrating(false);
        setStep(4);
      }
    }, 500);
  };

  const detectedAppliances = [
    { name: 'Air Conditioner', power: '1200W', confidence: 95, icon: '❄️' },
    { name: 'Geyser', power: '2000W', confidence: 92, icon: '🔥' },
    { name: 'Refrigerator', power: '150W', confidence: 98, icon: '🧊' },
    { name: 'Washing Machine', power: '500W', confidence: 88, icon: '🫧' },
  ];

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
          <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Connect your VoltWise smart plug</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className={`flex items-center justify-between mb-8 ${isCompact ? 'px-2' : 'px-4'}`}>
        {[1, 2, 3, 4].map((s) => (
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
                {s === 1 ? 'Scan' : s === 2 ? 'Connect' : s === 3 ? 'Calibrate' : 'Done'}
              </span>
            </div>
            {s < 4 && (
              <div className={`flex-1 h-1 mx-2 rounded-full ${step > s ? 'bg-cyan-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* QR Scanner Card */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <QrCode className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Scan QR Code</h3>
                  <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Find the QR code on your smart plug</p>
                </div>
              </div>

              {/* Fake QR Scanner Area */}
              <div className={`bg-slate-900 rounded-2xl flex items-center justify-center relative overflow-hidden ${isCompact ? 'h-40' : 'h-56'}`}>
                {isScanning ? (
                  <div className="absolute inset-4 border-2 border-cyan-400 rounded-xl animate-pulse">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-cyan-400 animate-scan" />
                  </div>
                ) : deviceFound ? (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center mb-3">
                      <Check className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-white font-bold">Device Found!</p>
                    <p className="text-slate-400 text-xs">VoltWise Plug Pro</p>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center text-slate-400">
                    <QrCode className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm">Position QR code here</p>
                  </div>
                )}
              </div>

              {!deviceFound ? (
                <button 
                  onClick={handleScan}
                  disabled={isScanning}
                  className={`w-full mt-4 bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-200 flex items-center justify-center gap-2 transition-all hover:bg-cyan-600 disabled:opacity-50 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
                >
                  {isScanning ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" /> Scanning...
                    </>
                  ) : (
                    <>
                      <QrCode className="w-5 h-5" /> Start Scanning
                    </>
                  )}
                </button>
              ) : (
                <button 
                  onClick={() => setStep(2)}
                  className={`w-full mt-4 bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
                >
                  Continue <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Manual Entry Option */}
            <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                    <Plug className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                  </div>
                  <div>
                    <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Enter Code Manually</h3>
                    <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Type the code from your device</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400" />
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* WiFi Setup */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <Wifi className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>Connect to WiFi</h3>
                  <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Your plug needs internet connection</p>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <div>
                  <label className={`text-slate-500 font-medium mb-1 block ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Network Name</label>
                  <input 
                    type="text" 
                    defaultValue="Home_WiFi_5G"
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-cyan-500 ${isCompact ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'}`}
                  />
                </div>
                <div>
                  <label className={`text-slate-500 font-medium mb-1 block ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Password</label>
                  <input 
                    type="password" 
                    defaultValue="password123"
                    className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium outline-none focus:border-cyan-500 ${isCompact ? 'rounded-lg px-3 py-2 text-sm' : 'rounded-xl px-4 py-3'}`}
                  />
                </div>
              </div>

              <button 
                onClick={handleWifiConnect}
                className={`w-full bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
              >
                <Wifi className="w-5 h-5" /> Connect
              </button>
            </div>

            {/* Device Info */}
            <div className={`bg-slate-900 text-white shadow-soft ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
              <div className="flex items-center gap-3">
                <div className={`rounded-xl bg-white/10 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <Plug className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold ${isCompact ? 'text-sm' : 'text-base'}`}>VoltWise Plug Pro</h3>
                  <p className={`text-slate-400 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Serial: VW-2024-PRO-8821</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-emerald-400">
                  <Radio className="w-4 h-4 animate-pulse" />
                  <span className={`font-bold ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Ready</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* NILM Calibration */}
            <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-5' : 'rounded-[2rem] p-6'}`}>
              <div className="flex items-center gap-3 mb-4">
                <div className={`rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  <Zap className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />
                </div>
                <div>
                  <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>NILM Calibration</h3>
                  <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Learning your appliance signatures</p>
                </div>
              </div>

              {!calibrating && calibrationProgress === 0 ? (
                <>
                  <div className={`bg-amber-50 border border-amber-100 flex items-start gap-3 mb-4 ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className={`text-amber-800 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                      For best results, turn on a few appliances (AC, Geyser, etc.) during calibration. Our AI will learn their unique electrical signatures.
                    </p>
                  </div>

                  <button 
                    onClick={handleCalibration}
                    className={`w-full bg-amber-500 text-white font-bold shadow-lg shadow-amber-200 flex items-center justify-center gap-2 ${isCompact ? 'py-3 rounded-xl text-sm' : 'py-4 rounded-2xl'}`}
                  >
                    <Zap className="w-5 h-5" /> Start Calibration
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className={`bg-slate-50 ${isCompact ? 'rounded-xl p-4' : 'rounded-2xl p-5'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : ''}`}>Analyzing electrical signals...</span>
                      <span className={`font-bold text-cyan-600 ${isCompact ? 'text-sm' : ''}`}>{calibrationProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${calibrationProgress}%` }}
                      />
                    </div>
                    <p className={`text-slate-500 mt-2 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                      {calibrationProgress < 30 && "Detecting power signatures..."}
                      {calibrationProgress >= 30 && calibrationProgress < 60 && "Identifying appliances..."}
                      {calibrationProgress >= 60 && calibrationProgress < 90 && "Building energy profiles..."}
                      {calibrationProgress >= 90 && "Finalizing setup..."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
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
              <p className={`text-emerald-700 ${isCompact ? 'text-xs' : 'text-sm'}`}>Your smart plug is ready to monitor energy</p>
            </div>

            {/* Detected Appliances */}
            <h3 className={`font-bold text-slate-800 mb-3 px-1 ${isCompact ? 'text-sm' : 'text-lg'}`}>Detected Appliances</h3>
            <div className="space-y-3 mb-6">
              {detectedAppliances.map((appliance, idx) => (
                <motion.div 
                  key={appliance.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`bg-white shadow-soft border border-slate-100 flex items-center justify-between ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={isCompact ? 'text-xl' : 'text-2xl'}>{appliance.icon}</span>
                    <div>
                      <h4 className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>{appliance.name}</h4>
                      <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{appliance.power}</p>
                    </div>
                  </div>
                  <div className={`bg-emerald-50 text-emerald-600 font-bold ${isCompact ? 'px-2 py-1 rounded-lg text-[10px]' : 'px-3 py-1 rounded-xl text-xs'}`}>
                    {appliance.confidence}% match
                  </div>
                </motion.div>
              ))}
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
