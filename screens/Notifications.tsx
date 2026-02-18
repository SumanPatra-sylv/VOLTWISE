import React, { useState } from 'react';
import { ArrowLeft, Bell, BellOff, Clock, Zap, AlertTriangle, Calendar, CheckCircle, Trash2, Settings, ChevronRight, Filter, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type ViewMode = 'mobile' | 'tablet' | 'web';

interface Props {
  onBack: () => void;
  viewMode?: ViewMode;
}

interface Notification {
  id: number;
  type: 'peak' | 'budget' | 'schedule' | 'tip' | 'system';
  title: string;
  message: string;
  time: string;
  read: boolean;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

const Notifications: React.FC<Props> = ({ onBack, viewMode = 'mobile' }) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  const isCompact = viewMode === 'web' || viewMode === 'tablet';

  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 1,
      type: 'peak',
      title: 'Peak Hours Starting Soon',
      message: 'Peak pricing begins in 30 minutes (6:00 PM - 10:00 PM). Consider reducing AC usage.',
      time: '5 mins ago',
      read: false,
      icon: <Zap className="w-5 h-5" />,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
    },
    {
      id: 2,
      type: 'budget',
      title: 'Budget Alert: 80% Used',
      message: 'You have used ₹1,600 of your ₹2,000 monthly budget. 8 days remaining.',
      time: '1 hour ago',
      read: false,
      icon: <AlertTriangle className="w-5 h-5" />,
      color: 'text-rose-600',
      bgColor: 'bg-rose-50',
    },
    {
      id: 3,
      type: 'schedule',
      title: 'Geyser Scheduled Off',
      message: 'Your geyser was automatically turned off at 8:00 AM as scheduled.',
      time: '3 hours ago',
      read: true,
      icon: <Clock className="w-5 h-5" />,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
    },
    {
      id: 4,
      type: 'tip',
      title: 'Energy Saving Tip',
      message: 'Your AC ran for 12 hours yesterday. Setting it to 24°C could save ₹45/day.',
      time: '6 hours ago',
      read: true,
      icon: <Zap className="w-5 h-5" />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
    {
      id: 5,
      type: 'schedule',
      title: 'Washing Machine Reminder',
      message: 'Best time to run your washing machine is 2:00 PM - 4:00 PM (off-peak rates).',
      time: 'Yesterday',
      read: true,
      icon: <Calendar className="w-5 h-5" />,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
    },
    {
      id: 6,
      type: 'system',
      title: 'Weekly Report Ready',
      message: 'Your energy usage report for last week is now available. You saved ₹320!',
      time: '2 days ago',
      read: true,
      icon: <CheckCircle className="w-5 h-5" />,
      color: 'text-slate-600',
      bgColor: 'bg-slate-100',
    },
    {
      id: 7,
      type: 'peak',
      title: 'Peak Hours Ended',
      message: 'Off-peak pricing is now active. This is a good time for high-energy tasks.',
      time: '3 days ago',
      read: true,
      icon: <Zap className="w-5 h-5" />,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
    },
  ]);

  const notificationSettings = [
    { id: 'peak', label: 'Peak Hour Alerts', description: 'Get notified before peak pricing starts', enabled: true },
    { id: 'budget', label: 'Budget Warnings', description: 'Alert when approaching budget limits', enabled: true },
    { id: 'schedule', label: 'Schedule Updates', description: 'Confirm when devices are auto-controlled', enabled: true },
    { id: 'tips', label: 'Saving Tips', description: 'AI-powered energy saving suggestions', enabled: false },
    { id: 'weekly', label: 'Weekly Reports', description: 'Summary of your energy usage', enabled: true },
  ];

  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.read)
    : notifications;

  const markAsRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
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
      {filteredNotifications.length === 0 ? (
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
