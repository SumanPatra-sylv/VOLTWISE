
import React from 'react';
import { User, Settings, Shield, LogOut, ChevronRight, MapPin, Zap, TreePine, Bell, FileText, Plug } from 'lucide-react';
import { Tab } from '../types';
import { useApp } from '../contexts/AppContext';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface ProfileProps {
    viewMode?: ViewMode;
    onNavigate?: (tab: Tab) => void;
}

/** Initials from full name (e.g. "Suman Patra" → "SP") */
function getInitials(name: string): string {
    return name
        .split(' ')
        .filter(Boolean)
        .map(w => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

const Profile: React.FC<ProfileProps> = ({ viewMode = 'mobile', onNavigate }) => {
    const isCompact = viewMode === 'web' || viewMode === 'tablet';

    // Real data from AppContext
    const { profile, home, meter, signOut } = useApp();
    const userName = profile?.name || 'User';
    const initials = getInitials(userName);
    const location = profile?.location || '—';
    const consumerNumber = profile?.consumer_number || '';

    // TODO: wire these to real carbon_stats table later
    const kwhSaved = 0;
    const treesPlanted = 0;

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch (err) {
            console.error('Sign out failed:', err);
        }
    };

    return (
        <div className="pt-10 pb-32 px-5 overflow-y-auto h-full no-scrollbar">

            {/* Header Profile Card */}
            <div className="flex flex-col items-center mb-8">
                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-cyan-400 to-indigo-500 shadow-lg mb-4">
                    <div className="w-full h-full rounded-full bg-white border-4 border-white overflow-hidden flex items-center justify-center">
                        <span className="text-3xl font-bold text-slate-800">{initials}</span>
                    </div>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{userName}</h2>
                <div className="flex items-center gap-1.5 text-slate-400 text-sm font-medium mt-1">
                    <MapPin className="w-3 h-3" /> {location}
                </div>
                {consumerNumber && (
                    <div className="text-xs text-slate-300 font-mono mt-1">
                        Consumer: {consumerNumber}
                    </div>
                )}
            </div>

            {/* Stats Grid (Bento) */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white p-5 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                        <Zap className="w-5 h-5 fill-current" />
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{kwhSaved.toLocaleString()}</div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">kWh Saved</div>
                </div>

                <div className="bg-white p-5 rounded-[2rem] shadow-soft border border-slate-100 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                        <TreePine className="w-5 h-5" />
                    </div>
                    <div className="text-2xl font-bold text-slate-800">{treesPlanted}</div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Trees Planted</div>
                </div>
            </div>

            {/* Settings Sections */}
            <div className="space-y-6">

                {/* Quick Actions - New Pages */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-3">Quick Actions</h3>
                    <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 overflow-hidden">
                        <SettingItem icon={Plug} label="Smart Plug Setup" value="Add Device" onClick={() => onNavigate?.('SmartPlugSetup')} />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <SettingItem icon={FileText} label="Bill History" value="View All" onClick={() => onNavigate?.('BillHistory')} />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <SettingItem icon={Bell} label="Notifications" value="3 New" onClick={() => onNavigate?.('Notifications')} />
                    </div>
                </div>

                {/* Account Group */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-3">My Home</h3>
                    <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 overflow-hidden">
                        <SettingItem icon={User} label="Home" value={home?.name || '—'} />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <SettingItem icon={Zap} label="Tariff Category" value={home?.tariff_category || '—'} />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <SettingItem icon={Zap} label="Sanctioned Load" value={home?.sanctioned_load_kw ? `${home.sanctioned_load_kw} kW` : '—'} />
                    </div>
                </div>

                {/* Preferences Group */}
                <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-2 mb-3">App Settings</h3>
                    <div className="bg-white rounded-[2rem] shadow-soft border border-slate-100 overflow-hidden">
                        <SettingItem icon={Settings} label="Notifications" />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <SettingItem icon={Shield} label="Privacy & Security" />
                        <div className="h-[1px] bg-slate-50 w-full"></div>
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors text-rose-500"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center">
                                    <LogOut className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-sm">Log Out</span>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="text-center mt-10 mb-4">
                <p className="text-xs text-slate-300 font-medium">VoltWise v1.0.2</p>
            </div>

        </div>
    );
};

const SettingItem: React.FC<{ icon: any, label: string, value?: string, onClick?: () => void }> = ({ icon: Icon, label, value, onClick }) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center group-hover:bg-cyan-50 group-hover:text-cyan-600 transition-colors">
                <Icon className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-700 text-sm">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            {value && <span className="text-xs font-medium text-slate-400">{value}</span>}
            <ChevronRight className="w-4 h-4 text-slate-300" />
        </div>
    </button>
);

export default Profile;
