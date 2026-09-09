import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Bell, BellOff, Clock, Zap, AlertTriangle, Calendar, CheckCircle, Trash2, Settings, ChevronRight, Filter, Volume2, VolumeX, Leaf, Shield, Bot, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  onNavigate?: (route: string) => void;
  viewMode?: ViewMode;
}

interface DBNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  icon?: string;
  color?: string;
  bg_color?: string;
  metadata?: any;
  created_at: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  metadata?: any;
}

/** Format relative time from ISO timestamp */
function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const then = new Date(isoDate);
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Map DB icon string to React icon element */
function getNotifIcon(iconName?: string): React.ReactNode {
  switch (iconName) {
    case 'zap': return <Zap className="w-5 h-5" />;
    case 'alert-triangle': return <AlertTriangle className="w-5 h-5" />;
    case 'check-circle': return <CheckCircle className="w-5 h-5" />;
    case 'clock': return <Clock className="w-5 h-5" />;
    case 'calendar': return <Calendar className="w-5 h-5" />;
    case 'leaf': return <Leaf className="w-5 h-5" />;
    case 'shield': return <Shield className="w-5 h-5" />;
    case 'bot': return <Bot className="w-5 h-5" />;
    case 'heart': return <Leaf className="w-5 h-5" />;
    default: return <Bell className="w-5 h-5" />;
  }
}

const Notifications: React.FC<Props> = ({ onBack, onNavigate, viewMode = 'mobile' }) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const { profile } = useApp();
  
  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  const [notifications, setNotifications] = useState<Notification[]>([]);

  /** Map a DB row to UI notification */
  const mapDBNotif = useCallback((row: DBNotification): Notification => ({
    id: row.id,
    type: row.type || 'system',
    title: row.title,
    message: row.message,
    time: formatRelativeTime(row.created_at),
    read: row.is_read,
    icon: getNotifIcon(row.icon),
    color: row.color || 'text-slate-600',
    bgColor: row.bg_color || 'bg-slate-100',
    metadata: (row as any).metadata || null,
  }), []);

  /** Fetch notifications from Supabase */
  useEffect(() => {
    if (!profile?.id) { setLoading(false); return; }
    let cancelled = false;

    const fetchNotifications = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!cancelled && data && !error) {
        setNotifications(data.map(mapDBNotif));
      }
      if (!cancelled) setLoading(false);
    };

    fetchNotifications();

    // Realtime subscription for new notifications
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const newNotif = mapDBNotif(payload.new as DBNotification);
          setNotifications(prev => [newNotif, ...prev]);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile?.id, mapDBNotif]);

  const notificationSettings = [
    { id: 'peak', label: 'Peak Hour Alerts', description: 'Get notified before peak pricing starts', enabled: true },
    { id: 'budget', label: 'Budget Warnings', description: 'Alert when approaching budget limits', enabled: true },
    { id: 'schedule', label: 'Schedule Updates', description: 'Confirm when devices are auto-controlled', enabled: true },
    { id: 'carbon', label: 'Clean Energy Alerts', description: 'Notify when grid carbon intensity is low', enabled: true },
    { id: 'autopilot', label: 'Autopilot Actions', description: 'When AI turns devices on/off', enabled: true },
    { id: 'tips', label: 'Saving Tips', description: 'AI-powered energy saving suggestions', enabled: false },
    { id: 'weekly', label: 'Weekly Reports', description: 'Summary of your energy usage', enabled: true },
  ];

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  };

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (profile?.id) {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  const clearAll = async () => {
    setNotifications([]);
    if (profile?.id) {
      await supabase.from('notifications').delete().eq('user_id', profile.id);
    }
  };

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
        <div className="flex-1">
          <h1 className={`font-bold text-slate-800 ${isCompact ? 'text-xl' : 'text-2xl'}`}>Notifications</h1>
          <p className={`text-slate-500 font-medium ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={`rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`}
        >
          <Settings className={isCompact ? 'w-4 h-4' : 'w-5 h-5'} />
        </button>
      </div>

      {/* Notification Toggle */}
      <div className={`bg-white shadow-soft border border-slate-100 mb-6 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl ${notificationsEnabled ? 'bg-cyan-50 text-cyan-600' : 'bg-slate-100 text-slate-400'} flex items-center justify-center ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
              {notificationsEnabled ? <Bell className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} /> : <BellOff className={isCompact ? 'w-5 h-5' : 'w-6 h-6'} />}
            </div>
            <div>
              <h3 className={`font-bold text-slate-800 ${isCompact ? 'text-sm' : 'text-base'}`}>
                {notificationsEnabled ? 'Notifications On' : 'Notifications Off'}
              </h3>
              <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                {notificationsEnabled ? 'Stay updated on your energy usage' : 'Enable to receive alerts'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`relative rounded-full transition-colors ${notificationsEnabled ? 'bg-cyan-500' : 'bg-slate-300'} ${isCompact ? 'w-12 h-6' : 'w-14 h-7'}`}
          >
            <motion.div 
              className={`absolute top-0.5 bg-white rounded-full shadow ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}`}
              animate={{ left: notificationsEnabled ? (isCompact ? '26px' : '30px') : '2px' }}
            />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className={`bg-white shadow-soft border border-slate-100 ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
              <h3 className={`font-bold text-slate-800 mb-4 ${isCompact ? 'text-sm' : 'text-lg'}`}>Notification Preferences</h3>
              <div className="space-y-3">
                {notificationSettings.map((setting) => (
                  <div key={setting.id} className="flex items-center justify-between">
                    <div>
                      <h4 className={`font-bold text-slate-700 ${isCompact ? 'text-xs' : 'text-sm'}`}>{setting.label}</h4>
                      <p className={`text-slate-500 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>{setting.description}</p>
                    </div>
                    <button className={`relative rounded-full ${setting.enabled ? 'bg-cyan-500' : 'bg-slate-300'} ${isCompact ? 'w-10 h-5' : 'w-12 h-6'}`}>
                      <div className={`absolute top-0.5 bg-white rounded-full shadow transition-all ${isCompact ? 'w-4 h-4' : 'w-5 h-5'} ${setting.enabled ? (isCompact ? 'left-[22px]' : 'left-[26px]') : 'left-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter & Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className={`flex bg-white border border-slate-200 shadow-sm ${isCompact ? 'rounded-lg p-0.5' : 'rounded-xl p-1'}`}>
          <button
            onClick={() => setFilter('all')}
            className={`font-bold transition-all ${filter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-500'} ${isCompact ? 'px-3 py-1 rounded-md text-[10px]' : 'px-4 py-1.5 rounded-lg text-xs'}`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`font-bold transition-all ${filter === 'unread' ? 'bg-slate-900 text-white' : 'text-slate-500'} ${isCompact ? 'px-3 py-1 rounded-md text-[10px]' : 'px-4 py-1.5 rounded-lg text-xs'}`}
          >
            Unread ({unreadCount})
          </button>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={markAllAsRead}
            className={`text-cyan-600 font-bold ${isCompact ? 'text-[10px]' : 'text-xs'}`}
          >
            Mark all read
          </button>
          <button 
            onClick={clearAll}
            className={`text-rose-500 font-bold ${isCompact ? 'text-[10px]' : 'text-xs'}`}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div className={`bg-white shadow-soft border border-slate-100 text-center ${isCompact ? 'rounded-2xl p-8' : 'rounded-[2rem] p-12'}`}>
          <Loader2 className={`animate-spin text-cyan-500 mx-auto mb-3 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`} />
          <p className={`text-slate-500 ${isCompact ? 'text-xs' : 'text-sm'}`}>Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className={`bg-white shadow-soft border border-slate-100 text-center ${isCompact ? 'rounded-2xl p-8' : 'rounded-[2rem] p-12'}`}>
          <div className={`rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 ${isCompact ? 'w-16 h-16' : 'w-20 h-20'}`}>
            <Bell className={`text-slate-400 ${isCompact ? 'w-8 h-8' : 'w-10 h-10'}`} />
          </div>
          <h3 className={`font-bold text-slate-800 mb-2 ${isCompact ? 'text-lg' : 'text-xl'}`}>No Notifications</h3>
          <p className={`text-slate-500 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            {filter === 'unread' ? 'All caught up! No unread notifications.' : 'You don\'t have any notifications yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((notification, idx) => (
            <motion.div 
              key={notification.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              exit={{ opacity: 0, x: -100 }}
              onClick={() => markAsRead(notification.id)}
              className={`bg-white shadow-soft border cursor-pointer transition-all hover:shadow-md ${!notification.read ? 'border-cyan-200' : 'border-slate-100'} ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}
            >
              <div className="flex gap-3">
                <div className={`rounded-xl ${notification.bgColor} ${notification.color} flex items-center justify-center flex-shrink-0 ${isCompact ? 'w-10 h-10' : 'w-12 h-12'}`}>
                  {notification.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className={`font-bold text-slate-800 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                      {notification.title}
                      {!notification.read && (
                        <span className="inline-block w-2 h-2 rounded-full bg-cyan-500 ml-2" />
                      )}
                    </h4>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} />
                    </button>
                  </div>
                  <p className={`text-slate-500 mt-1 ${isCompact ? 'text-[10px]' : 'text-xs'}`}>
                    {notification.message}
                  </p>
                  {/* Fix / Action button for peak savings notifications */}
                  {notification.metadata?.subtype === 'peak_savings_alert' && notification.metadata?.action === 'navigate_optimizer' && onNavigate && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notification.id);
                        onNavigate('/optimizer');
                      }}
                      className={`mt-2 inline-flex items-center gap-1.5 bg-amber-500 text-white font-bold rounded-lg shadow-sm hover:bg-amber-600 active:scale-95 transition-all ${isCompact ? 'px-3 py-1 text-[10px]' : 'px-4 py-1.5 text-xs'}`}
                    >
                      <Zap className={isCompact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                      Fix — Save ₹{notification.metadata?.total_potential_savings?.toFixed(0) || '?'}
                    </button>
                  )}
                  <p className={`text-slate-400 mt-2 font-medium ${isCompact ? 'text-[9px]' : 'text-[10px]'}`}>
                    {notification.time}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className={`mt-6 bg-slate-900 text-white shadow-xl ${isCompact ? 'rounded-2xl p-4' : 'rounded-[2rem] p-5'}`}>
        <h3 className={`font-bold mb-3 ${isCompact ? 'text-sm' : 'text-base'}`}>Quick Actions</h3>
        <div className={`grid ${isCompact ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
          <button className={`bg-white/10 flex flex-col items-center text-center ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
            <Volume2 className={`mb-2 ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}`} />
            <span className={`font-bold ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Sound On</span>
          </button>
          <button className={`bg-white/10 flex flex-col items-center text-center ${isCompact ? 'rounded-xl p-3' : 'rounded-2xl p-4'}`}>
            <Clock className={`mb-2 ${isCompact ? 'w-5 h-5' : 'w-6 h-6'}`} />
            <span className={`font-bold ${isCompact ? 'text-[10px]' : 'text-xs'}`}>Quiet Hours</span>
          </button>
          {isCompact && (
            <button className={`bg-white/10 flex flex-col items-center text-center rounded-xl p-3`}>
              <Filter className="w-5 h-5 mb-2" />
              <span className="font-bold text-[10px]">Filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Notifications;
