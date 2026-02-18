import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, PieChart, Trophy, ArrowRight } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

const Onboarding: React.FC<Props> = ({ onComplete }) => {
  const [step, setStep] = useState(0);

  const steps = [
    {
      icon: <Zap className="w-16 h-16 text-cyan-500" />,
      title: "See Every Watt, Save Every Rupee",
      desc: "AI detects your appliances automatically and tracks real-time usage.",
      bg: "bg-white"
    },
    {
      icon: <PieChart className="w-16 h-16 text-indigo-500" />,
      title: "Smart Scheduling, Zero Effort",
      desc: "Run appliances when electricity is cheapest. We automate the timing.",
      bg: "bg-slate-50"
    },
    {
      icon: <Trophy className="w-16 h-16 text-amber-500" />,
      title: "Compete, Save, Win Rewards",
      desc: "Join 10,000+ users saving 20% on bills. Earn points for every unit saved.",
      bg: "bg-white"
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className={`h-full w-full absolute inset-0 ${steps[step].bg} transition-colors duration-500 flex flex-col items-center justify-between p-8 pt-20 pb-12`}>
      
      {/* Top Graphic Area */}
      <AnimatePresence mode='wait'>
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.4 }}
          className="flex-1 flex flex-col items-center justify-center text-center max-w-sm"
        >
          <div className="mb-12 p-10 rounded-[3rem] bg-white border border-slate-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)]">
            {steps[step].icon}
          </div>
          <h1 className="text-4xl font-bold text-slate-900 mb-6 leading-tight tracking-tight">{steps[step].title}</h1>
          <p className="text-slate-500 text-lg leading-relaxed font-medium">{steps[step].desc}</p>
        </motion.div>
      </AnimatePresence>

      <div className="w-full flex flex-col items-center gap-8">
        {/* Indicators */}
        <div className="flex gap-2">
            {steps.map((_, i) => (
                <div key={i} className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-slate-900' : 'w-2 bg-slate-200'}`} />
            ))}
        </div>

        <button 
            onClick={handleNext}
            className="w-full py-5 bg-slate-900 text-white font-bold text-lg rounded-[1.5rem] shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
        >
            {step === steps.length - 1 ? "Get Started" : "Next"} <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default Onboarding;