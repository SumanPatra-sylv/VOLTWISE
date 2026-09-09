import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Zap, Home, Search, LogOut, Eye, TrendingUp,
  CheckCircle, Clock, X, Loader2, RefreshCw, DollarSign,
  LayoutDashboard, Settings, BarChart3, HelpCircle, ChevronRight,
  UserPlus, Activity, Bell, Calendar
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';

/* ──────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────── */

interface UserData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  consumer_number: string | null;
  role: string;
  onboarding_done: boolean;
  created_at: string;
  home_name?: string;
  meter_number?: string;
  balance?: number;
  total_usage_kwh?: number;
}

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalHomes: number;
  totalRechargeAmount: number;
  avgBalance: number;
}

type NavPage = 'dashboard' | 'users' | 'homes' | 'analytics' | 'settings';

/* ──────────────────────────────────────────────────────────────────
   Color Palette
   ────────────────────────────────────────────────────────────────── */

const COLORS = {
  sidebarBg: '#1c1c2e',
  sidebarHover: '#2a2a40',
  sidebarActive: '#343450',
  accent: '#6c5ce7',
  accentLight: '#a29bfe',
  green: '#00b894',
  greenBg: 'rgba(0, 184, 148, 0.1)',
  blue: '#0984e3',
  blueBg: 'rgba(9, 132, 227, 0.1)',
  orange: '#fdcb6e',
  orangeBg: 'rgba(253, 203, 110, 0.12)',
  pink: '#e84393',
  pinkBg: 'rgba(232, 67, 147, 0.1)',
  textPrimary: '#2d3436',
  textSecondary: '#636e72',
  textMuted: '#b2bec3',
  border: '#f0f0f5',
  cardBg: '#ffffff',
  pageBg: '#f7f8fc',
};

/* ──────────────────────────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────────────────────────── */

const AdminDashboard: React.FC = () => {
  const { signOut, profile } = useApp();
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  /* ── Data Fetching (preserved) ─────────────────────────────────── */

  const fetchDashboardData = useCallback(async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithData: UserData[] = await Promise.all(
        (profiles || []).map(async (p) => {
          const { data: homes } = await supabase
            .from('homes')
            .select('id, name')
            .eq('user_id', p.id)
            .eq('is_primary', true)
            .single();

          let meterNumber = null;
          let balance = 0;

          if (homes?.id) {
            const { data: meter } = await supabase
              .from('meters')
              .select('meter_number, balance_amount')
              .eq('home_id', homes.id)
              .eq('is_active', true)
              .single();

            meterNumber = meter?.meter_number;
            balance = meter?.balance_amount || 0;
          }

          const { data: authData } = await supabase.auth.admin.getUserById(p.id).catch(() => ({ data: null }));

          return {
            id: p.id,
            name: p.name,
            email: authData?.user?.email || 'N/A',
            phone: p.phone,
            consumer_number: p.consumer_number,
            role: p.role,
            onboarding_done: p.onboarding_done,
            created_at: p.created_at,
            home_name: homes?.name,
            meter_number: meterNumber,
            balance: balance,
          };
        })
      );

      setUsers(usersWithData);

      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: activeUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarding_done', true);
      const { count: totalHomes } = await supabase.from('homes').select('*', { count: 'exact', head: true });
      const { data: recharges } = await supabase.from('recharges').select('amount');
      const { data: meters } = await supabase.from('meters').select('balance_amount');

      let totalRechargeAmount = recharges?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
      if (totalRechargeAmount === 0 && meters?.length) {
        totalRechargeAmount = meters.reduce((sum, m) => sum + Number(m.balance_amount || 0), 0);
      }
      const avgBalance = meters?.length ? meters.reduce((sum, m) => sum + Number(m.balance_amount || 0), 0) / meters.length : 0;

      setStats({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalHomes: totalHomes || 0,
        totalRechargeAmount,
        avgBalance,
      });
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.consumer_number?.includes(searchQuery) ||
    user.phone?.includes(searchQuery)
  );

  const handleLogout = async () => {
    await signOut();
  };

  /* ── Chart Data — user signups over time ───────────────────────── */

  const chartData = useMemo(() => {
    const monthMap: Record<string, number> = {};
    users.forEach(u => {
      const d = new Date(u.created_at);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    // Build cumulative
    const entries = Object.entries(monthMap);
    let cumulative = 0;
    return entries.map(([month, count]) => {
      cumulative += count;
      return { month, newUsers: count, totalUsers: cumulative };
    });
  }, [users]);

  /* ── Recent activity (latest 6 signups) ────────────────────────── */

  const recentActivity = useMemo(() =>
    users.slice(0, 6).map(u => ({
      id: u.id,
      name: u.name,
      action: u.onboarding_done ? 'Completed onboarding' : 'Signed up',
      time: new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
      initial: u.name.charAt(0).toUpperCase(),
    }))
  , [users]);

  /* ── Current date ──────────────────────────────────────────────── */

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /* ── Loading State ─────────────────────────────────────────────── */

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
        >
          <Loader2 style={{ width: 40, height: 40, color: COLORS.accent }} className="animate-spin" />
          <p style={{ color: COLORS.textSecondary, fontWeight: 500, fontSize: 14 }}>Loading admin dashboard...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: COLORS.pageBg, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ═══════════ LEFT SIDEBAR ═══════════ */}
      <aside style={{
        width: sidebarCollapsed ? 72 : 250,
        minHeight: '100vh',
        background: COLORS.sidebarBg,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '24px 12px' : '24px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Zap style={{ width: 22, height: 22, color: '#fff' }} fill="currentColor" />
          </div>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: '0.5px' }}>VoltWise</span>
              <span style={{ display: 'block', color: COLORS.accentLight, fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase' as const }}>Admin</span>
            </motion.div>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activePage === 'dashboard'} collapsed={sidebarCollapsed} onClick={() => setActivePage('dashboard')} />
          <SidebarItem icon={Users} label="Users" active={activePage === 'users'} collapsed={sidebarCollapsed} onClick={() => setActivePage('users')} badge={stats?.totalUsers} />
          <SidebarItem icon={Home} label="Homes" active={activePage === 'homes'} collapsed={sidebarCollapsed} onClick={() => setActivePage('homes')} badge={stats?.totalHomes} />
          <SidebarItem icon={BarChart3} label="Analytics" active={activePage === 'analytics'} collapsed={sidebarCollapsed} onClick={() => setActivePage('analytics')} />

          <div style={{ flex: 1 }} />

          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: 'none',
              borderRadius: 10,
              padding: '10px',
              color: COLORS.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
              transition: 'all 0.2s',
            }}
          >
            <ChevronRight style={{ width: 18, height: 18, transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s' }} />
          </button>

          <SidebarItem icon={HelpCircle} label="Help & Info" active={false} collapsed={sidebarCollapsed} onClick={() => {}} />
          <SidebarItem icon={LogOut} label="Log out" active={false} collapsed={sidebarCollapsed} onClick={handleLogout} danger />
        </nav>
      </aside>

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main style={{
        flex: 1,
        marginLeft: sidebarCollapsed ? 72 : 250,
        marginRight: 300,
        padding: '32px 36px',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        overflowY: 'auto' as const,
      }}>

        {/* ── Greeting Header ──────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
              Hello, {profile?.name?.split(' ')[0] || 'Admin'} 👋
            </h1>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: 4 }}>
              Track platform progress here. You almost reach a goal!
            </p>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: COLORS.textMuted }}>{today}</span>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: COLORS.cardBg,
                border: `1px solid ${COLORS.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                color: COLORS.textSecondary,
                transition: 'all 0.2s',
              }}
            >
              <RefreshCw style={{ width: 16, height: 16, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* ── Stat Cards ───────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32 }}>
          <StatPill
            icon={Users}
            label="Total Users"
            value={stats?.totalUsers || 0}
            subtext={`${stats?.activeUsers || 0} active`}
            iconBg={COLORS.blueBg}
            iconColor={COLORS.blue}
            delay={0}
          />
          <StatPill
            icon={DollarSign}
            label="Total Recharged"
            value={`₹${((stats?.totalRechargeAmount || 0) / 1000).toFixed(0)}K`}
            subtext={`Avg ₹${(stats?.avgBalance || 0).toFixed(0)}`}
            iconBg={COLORS.greenBg}
            iconColor={COLORS.green}
            delay={0.1}
          />
          <StatPill
            icon={Home}
            label="Registered Homes"
            value={stats?.totalHomes || 0}
            subtext={`${stats?.activeUsers || 0} onboarded`}
            iconBg={COLORS.orangeBg}
            iconColor="#e17055"
            delay={0.2}
          />
        </div>

        {/* ── Performance Chart ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{
            background: COLORS.cardBg,
            borderRadius: 20,
            padding: '24px 28px',
            border: `1px solid ${COLORS.border}`,
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>User Growth</h3>
            <span style={{
              fontSize: 12,
              color: COLORS.textMuted,
              background: COLORS.pageBg,
              padding: '6px 14px',
              borderRadius: 8,
              fontWeight: 500,
            }}>All time</span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: COLORS.textMuted, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: COLORS.sidebarBg,
                    border: 'none',
                    borderRadius: 12,
                    padding: '10px 16px',
                    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                  }}
                  labelStyle={{ color: '#fff', fontWeight: 600, fontSize: 12 }}
                  itemStyle={{ color: COLORS.accentLight, fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="totalUsers"
                  stroke={COLORS.accent}
                  strokeWidth={2.5}
                  fill="url(#colorUsers)"
                  dot={{ r: 4, fill: COLORS.accent, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: COLORS.accent, stroke: '#fff', strokeWidth: 2 }}
                  name="Total Users"
                />
                <Line
                  type="monotone"
                  dataKey="newUsers"
                  stroke={COLORS.green}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  name="New Users"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* ── Users Table ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            background: COLORS.cardBg,
            borderRadius: 20,
            border: `1px solid ${COLORS.border}`,
            overflow: 'hidden',
          }}
        >
          {/* Table Header */}
          <div style={{
            padding: '20px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>All Users</h3>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: COLORS.textMuted,
                background: COLORS.pageBg,
                padding: '3px 10px',
                borderRadius: 6,
              }}>
                {filteredUsers.length} of {users.length}
              </span>
            </div>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}>
              <Search style={{ position: 'absolute', left: 12, width: 16, height: 16, color: COLORS.textMuted }} />
              <input
                type="text"
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: 38,
                  paddingRight: 16,
                  paddingTop: 9,
                  paddingBottom: 9,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
                  fontSize: 13,
                  color: COLORS.textPrimary,
                  background: COLORS.pageBg,
                  outline: 'none',
                  width: 220,
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => e.target.style.borderColor = COLORS.accent}
                onBlur={(e) => e.target.style.borderColor = COLORS.border}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' as const }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr style={{ background: COLORS.pageBg }}>
                  {['User', 'Consumer No.', 'Home', 'Balance', 'Status', 'Joined', ''].map((h, i) => (
                    <th key={i} style={{
                      padding: '12px 20px',
                      textAlign: 'left' as const,
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.textMuted,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.5px',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center' as const, color: COLORS.textMuted, fontSize: 14 }}>
                      {searchQuery ? 'No users match your search' : 'No users found'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, idx) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.pageBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: `linear-gradient(135deg, ${['#6c5ce7','#00b894','#0984e3','#e84393','#fdcb6e','#e17055'][idx % 6]}, ${['#a29bfe','#55efc4','#74b9ff','#fd79a8','#ffeaa7','#fab1a0'][idx % 6]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                          }}>
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, color: COLORS.textPrimary, fontSize: 13, margin: 0 }}>{user.name}</p>
                            <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 13, color: COLORS.textSecondary, fontFamily: 'monospace' }}>
                          {user.consumer_number || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
                          {user.home_name || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: (user.balance || 0) > 100 ? COLORS.green : COLORS.pink,
                        }}>
                          ₹{(user.balance || 0).toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {user.onboarding_done ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 8,
                            background: COLORS.greenBg, color: COLORS.green,
                            fontSize: 11, fontWeight: 600,
                          }}>
                            <CheckCircle style={{ width: 12, height: 12 }} /> Active
                          </span>
                        ) : (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 8,
                            background: COLORS.orangeBg, color: '#e17055',
                            fontSize: 11, fontWeight: 600,
                          }}>
                            <Clock style={{ width: 12, height: 12 }} /> Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 12, color: COLORS.textMuted }}>
                          {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <button
                          onClick={() => setSelectedUser(user)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            border: `1px solid ${COLORS.border}`,
                            background: 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            color: COLORS.textMuted,
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.accent; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = COLORS.accent; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = COLORS.textMuted; e.currentTarget.style.borderColor = COLORS.border; }}
                        >
                          <Eye style={{ width: 14, height: 14 }} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>

      {/* ═══════════ RIGHT PANEL ═══════════ */}
      <aside style={{
        width: 300,
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        background: COLORS.cardBg,
        borderLeft: `1px solid ${COLORS.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto' as const,
      }}>
        {/* Admin Profile Card */}
        <div style={{
          padding: '32px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#fff',
            marginBottom: 12,
            boxShadow: `0 8px 24px ${COLORS.accent}40`,
          }}>
            {profile?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
            {profile?.name || 'Admin'}
          </h3>
          <p style={{ fontSize: 12, color: COLORS.accentLight, fontWeight: 600, margin: '4px 0 0', textTransform: 'uppercase' as const, letterSpacing: 1 }}>
            @{profile?.role || 'admin'}
          </p>

          {/* Quick Stats under profile */}
          <div style={{ display: 'flex', gap: 16, marginTop: 20, width: '100%' }}>
            <div style={{ flex: 1, textAlign: 'center' as const, padding: '10px 0', background: COLORS.pageBg, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>{stats?.activeUsers || 0}</p>
              <p style={{ fontSize: 10, color: COLORS.textMuted, margin: '2px 0 0', fontWeight: 500 }}>Active</p>
            </div>
            <div style={{ flex: 1, textAlign: 'center' as const, padding: '10px 0', background: COLORS.pageBg, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>₹{(stats?.avgBalance || 0).toFixed(0)}</p>
              <p style={{ fontSize: 10, color: COLORS.textMuted, margin: '2px 0 0', fontWeight: 500 }}>Avg Bal</p>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div style={{ padding: '20px 24px' }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 16px' }}>Recent Activity</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {recentActivity.map((item, idx) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * idx }}
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${['#6c5ce7','#00b894','#0984e3','#e84393','#fdcb6e','#e17055'][idx % 6]}, ${['#a29bfe','#55efc4','#74b9ff','#fd79a8','#ffeaa7','#fab1a0'][idx % 6]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                }}>
                  {item.initial}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '2px 0 0' }}>{item.action}</p>
                </div>
                <span style={{ fontSize: 10, color: COLORS.textMuted, whiteSpace: 'nowrap' as const, marginTop: 2 }}>{item.time}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* System Stats Mini */}
        <div style={{ margin: '0 24px', padding: '16px', background: COLORS.pageBg, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Activity style={{ width: 14, height: 14, color: COLORS.accent }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textPrimary }}>Platform Health</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <HealthBar label="Onboarding Rate" value={stats ? Math.round((stats.activeUsers / Math.max(stats.totalUsers, 1)) * 100) : 0} color={COLORS.green} />
            <HealthBar label="Homes / Users" value={stats ? Math.round((stats.totalHomes / Math.max(stats.totalUsers, 1)) * 100) : 0} color={COLORS.blue} />
          </div>
        </div>
      </aside>

      {/* ═══════════ USER DETAIL MODAL ═══════════ */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
        )}
      </AnimatePresence>

      {/* Spin animation keyframes */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

/* ── Sidebar Nav Item ──────────────────────────────────────────────── */

interface SidebarItemProps {
  icon: React.FC<{ style?: React.CSSProperties; className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  badge?: number;
  danger?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, collapsed, onClick, badge, danger }) => {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? COLORS.sidebarActive
    : hovered
      ? COLORS.sidebarHover
      : 'transparent';

  const textColor = danger
    ? '#ff6b6b'
    : active
      ? '#fff'
      : hovered
        ? '#dfe6e9'
        : '#b2bec3';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: collapsed ? '10px' : '10px 16px',
        borderRadius: 12,
        border: 'none',
        background: bg,
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        justifyContent: collapsed ? 'center' : 'flex-start',
        width: '100%',
      }}
    >
      {active && (
        <div style={{
          position: 'absolute',
          left: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 4,
          height: 24,
          borderRadius: '0 4px 4px 0',
          background: COLORS.accent,
        }} />
      )}
      <Icon style={{ width: 20, height: 20, color: active ? COLORS.accentLight : textColor, flexShrink: 0, transition: 'color 0.2s' }} />
      {!collapsed && (
        <>
          <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: textColor, transition: 'color 0.2s', whiteSpace: 'nowrap' as const }}>{label}</span>
          {badge !== undefined && (
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontWeight: 700,
              color: COLORS.accentLight,
              background: 'rgba(108, 92, 231, 0.15)',
              padding: '2px 8px',
              borderRadius: 6,
            }}>
              {badge}
            </span>
          )}
        </>
      )}
    </button>
  );
};

/* ── Stat Pill Card ─────────────────────────────────────────────────── */

interface StatPillProps {
  icon: React.FC<{ style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  subtext: string;
  iconBg: string;
  iconColor: string;
  delay: number;
}

const StatPill: React.FC<StatPillProps> = ({ icon: Icon, label, value, subtext, iconBg, iconColor, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
    style={{
      background: COLORS.cardBg,
      borderRadius: 18,
      padding: '22px 24px',
      border: `1px solid ${COLORS.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      cursor: 'default',
      transition: 'box-shadow 0.3s, transform 0.3s',
    }}
  >
    <div style={{
      width: 48, height: 48, borderRadius: 14,
      background: iconBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon style={{ width: 22, height: 22, color: iconColor }} />
    </div>
    <div>
      <p style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: 0, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 11, color: COLORS.textMuted, margin: '4px 0 0', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 10, color: COLORS.green, margin: '2px 0 0', fontWeight: 600 }}>{subtext}</p>
    </div>
  </motion.div>
);

/* ── Health Bar ─────────────────────────────────────────────────────── */

const HealthBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: COLORS.textSecondary, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: COLORS.textPrimary, fontWeight: 700 }}>{value}%</span>
    </div>
    <div style={{ height: 6, borderRadius: 3, background: COLORS.border, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
        style={{ height: '100%', borderRadius: 3, background: color }}
      />
    </div>
  </div>
);

/* ── User Detail Modal (preserved) ──────────────────────────────── */

interface UserDetailModalProps {
  user: UserData;
  onClose: () => void;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ user, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0, y: 20 }}
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#fff',
        borderRadius: 24,
        width: '100%',
        maxWidth: 440,
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.15)',
      }}
    >
      {/* Modal Header */}
      <div style={{
        padding: '28px 28px 20px',
        background: `linear-gradient(135deg, ${COLORS.sidebarBg}, #2d2d44)`,
        color: '#fff',
        position: 'relative',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 10,
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 700, color: '#fff',
          }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{user.name}</h2>
            <p style={{ fontSize: 13, color: COLORS.accentLight, margin: '2px 0 0' }}>{user.email}</p>
          </div>
        </div>
      </div>

      {/* Modal Body */}
      <div style={{ padding: '20px 28px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <DetailRow label="Phone" value={user.phone || 'Not provided'} />
          <DetailRow label="Consumer Number" value={user.consumer_number || 'Not linked'} />
          <DetailRow label="Home" value={user.home_name || 'No home registered'} />
          <DetailRow label="Meter Number" value={user.meter_number || 'No meter'} />
          <DetailRow label="Current Balance" value={`₹${(user.balance || 0).toFixed(2)}`} highlight />
          <DetailRow label="Role" value={user.role} />
          <DetailRow label="Status" value={user.onboarding_done ? 'Active' : 'Onboarding Pending'} />
          <DetailRow label="Joined" value={new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
        </div>
      </div>
    </motion.div>
  </motion.div>
);

const DetailRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: `1px solid ${COLORS.border}`,
  }}>
    <span style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: 500 }}>{label}</span>
    <span style={{
      fontSize: 13,
      fontWeight: 600,
      color: highlight ? COLORS.green : COLORS.textPrimary,
    }}>{value}</span>
  </div>
);

export default AdminDashboard;
