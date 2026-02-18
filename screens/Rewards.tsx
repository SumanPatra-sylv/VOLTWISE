import React from 'react';
import { Trophy, Lock, Star, Sparkles, Target, TreePine, Users, Globe } from 'lucide-react';
import { ACHIEVEMENTS, CHALLENGES, CARBON_STATS, CARBON_COMPARISON_DATA } from '../constants';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface RewardsProps {
  viewMode?: ViewMode;
}

const Rewards: React.FC<RewardsProps> = ({ viewMode = 'mobile' }) => {
  const isCompact = viewMode === 'web' || viewMode === 'tablet';
  return (
    <div className="pt-10 pb-32 px-5 overflow-y-auto h-full no-scrollbar">
      
      {/* Header Points (Hero) */}
      <div className="flex flex-col items-center justify-center mb-10">
        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mb-4 shadow-sm rotate-3">
            <Trophy className="w-8 h-8 fill-current" />
        </div>
        <h1 className="text-5xl font-bold text-slate-800 tracking-tight">3,450</h1>
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Gem Points</p>
        
        <div className="mt-6 flex items-center gap-3 w-full max-w-xs">
             <div className="text-xs font-bold text-slate-800 whitespace-nowrap">Level 8</div>
             <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 w-[70%] rounded-full shadow-sm"></div>
             </div>
             <div className="text-xs font-bold text-slate-400">Lv 9</div>
        </div>
      </div>

      {/* Carbon Footprint Section (New) */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-6 mb-8 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
            <TreePine className="w-40 h-40 text-emerald-600" />
        </div>
        
        <div className="relative z-10 mb-4">
            <div className="flex items-center gap-2 mb-2">
                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase">Your Impact</span>
            </div>
            <div className="text-emerald-900 font-bold text-3xl mb-1">{CARBON_STATS.co2Saved} kg</div>
            <div className="text-emerald-700/60 text-xs font-medium uppercase tracking-wider">CO₂ Avoided This Month</div>
        </div>

        <div className="grid grid-cols-2 gap-3 relative z-10">
            <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 flex flex-col items-center">
                <TreePine className="w-5 h-5 text-emerald-600 mb-1" />
                <div className="text-lg font-bold text-slate-800">{CARBON_STATS.trees}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Trees Saved</div>
            </div>
            <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-white/50 flex flex-col items-center">
                <Globe className="w-5 h-5 text-cyan-600 mb-1" />
                <div className="text-lg font-bold text-slate-800">Top 5%</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Global Rank</div>
            </div>
        </div>
      </div>

      {/* Community Comparison Chart (New) */}
      <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-600">
                  <Users className="w-5 h-5" />
              </div>
              <div>
                  <h3 className="font-bold text-slate-800">How You Compare</h3>
                  <p className="text-xs text-slate-400">Monthly Usage (kWh)</p>
              </div>
          </div>
          
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={CARBON_COMPARISON_DATA} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={70} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px' }} />
                    <Bar dataKey="value" barSize={24} radius={[0, 4, 4, 0]}>
                         {CARBON_COMPARISON_DATA.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2 italic">You consume 19% less than your neighbors!</p>
      </div>

      {/* Monthly Goal Card */}
      <div className="bg-slate-800 text-white rounded-[2rem] p-6 mb-8 relative overflow-hidden shadow-xl shadow-slate-200">
         <div className="absolute top-[-20%] right-[-10%] w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
         
         <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-emerald-400 border border-white/10">
                    <Target className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-lg leading-none mb-1">Monthly Goal</h3>
                    <p className="text-xs text-slate-400">Keep bill under ₹2,400</p>
                </div>
            </div>
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-1 rounded-lg text-xs font-bold backdrop-blur-sm">Active</span>
         </div>

         <div className="relative z-10">
             <div className="flex justify-between items-end mb-2">
                 <span className="text-2xl font-bold">₹1,783 <span className="text-sm font-medium text-slate-400">used</span></span>
                 <span className="text-xs font-medium text-slate-400">74% of budget</span>
             </div>
             <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden mb-3">
                 <div className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 w-[74%] rounded-full shadow-[0_0_10px_rgba(52,211,153,0.5)]"></div>
             </div>
             <p className="text-xs text-slate-400 flex items-center gap-1">
                 <Sparkles className="w-3 h-3 text-amber-400" /> Reward: <span className="text-white font-bold">500 Bonus Points</span>
             </p>
         </div>
      </div>

      {/* Challenges & Badges */}
      <div className="flex justify-between items-end mb-4">
        <h3 className="text-xl font-bold text-slate-800">Challenges</h3>
        <span className="text-xs font-bold text-amber-500">View All</span>
      </div>
      
      <div className="space-y-4 mb-8">
        {CHALLENGES.map(challenge => (
            <div key={challenge.id} className="bg-white border border-slate-100 rounded-[1.5rem] p-5 shadow-soft">
                <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-slate-800">{challenge.title}</h4>
                    <span className="text-[10px] px-2 py-1 bg-amber-50 text-amber-600 rounded-lg font-bold border border-amber-100">+{challenge.reward} pts</span>
                </div>
                <div className="w-full h-2 bg-slate-50 rounded-full overflow-hidden mb-3">
                    <div 
                        className="h-full bg-amber-400 rounded-full"
                        style={{ width: `${(challenge.progress / challenge.total) * 100}%` }}
                    ></div>
                </div>
                <div className="flex justify-between text-xs font-medium text-slate-400">
                    <span>{challenge.daysLeft} days left</span>
                    <span className="text-slate-600">{challenge.progress}/{challenge.total} completed</span>
                </div>
            </div>
        ))}
      </div>

    </div>
  );
};

export default Rewards;