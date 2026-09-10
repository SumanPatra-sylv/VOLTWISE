import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Zap, Home, Activity, Search, ChevronRight,
  LogOut, Eye, TrendingUp, DollarSign, LayoutDashboard,
  CheckCircle, Clock, X, Loader2, RefreshCw, HelpCircle, BarChart3
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line } from 'recharts';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';

// ── Types ──────────────────────────────────────────────────────────

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

type NavPage = 'dashboard' | 'users' | 'homes' | 'analytics';

// ── Color Palette ──────────────────────────────────────────────────

const C = {
  sidebar: '#1c1c2e',
  sidebarHover: '#2a2a40',
  sidebarActive: '#343450',
  accent: '#6c5ce7',
  accentLight: '#a29bfe',
  green: '#00b894',
  greenBg: 'rgba(0,184,148,0.1)',
  blue: '#0984e3',
  blueBg: 'rgba(9,132,227,0.1)',
  orange: '#e17055',
  orangeBg: 'rgba(225,112,85,0.1)',
  pink: '#e84393',
  pinkBg: 'rgba(232,67,147,0.1)',
  text: '#2d3436',
  textSec: '#636e72',
  muted: '#b2bec3',
  border: '#f0f0f5',
  card: '#ffffff',
  page: '#f7f8fc',
};

// ── Gradient palette for avatars ───────────────────────────────────

const GRAD = [
  ['#6c5ce7','#a29bfe'], ['#00b894','#55efc4'], ['#0984e3','#74b9ff'],
  ['#e84393','#fd79a8'], ['#fdcb6e','#ffeaa7'], ['#e17055','#fab1a0'],
];

// ══════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════

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

  // ── Data Fetching ─────────────────────────────────────────────

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch all users with their home and meter data
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get additional data for each user
      const usersWithData: UserData[] = await Promise.all(
        (profiles || []).map(async (p) => {
          // Get home
          const { data: homes } = await supabase
            .from('homes')
            .select('id, name')
            .eq('user_id', p.id)
            .eq('is_primary', true)
            .single();

          let meterNumber = null;
          let balance = 0;

          if (homes?.id) {
            // Get meter
            const { data: meter } = await supabase
              .from('meters')
              .select('meter_number, balance_amount')
              .eq('home_id', homes.id)
              .eq('is_active', true)
              .single();

            meterNumber = meter?.meter_number;
            balance = meter?.balance_amount || 0;
          }

          // Get auth user email
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

      // Calculate stats
      const { count: totalUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: activeUsers } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('onboarding_done', true);
      const { count: totalHomes } = await supabase.from('homes').select('*', { count: 'exact', head: true });
      const { data: recharges } = await supabase.from('recharges').select('amount');
      const { data: meters } = await supabase.from('meters').select('balance_amount');

      // Calculate total recharged from recharges table, fallback to sum of balances if no recharges
      let totalRechargeAmount = recharges?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;

      // If no recharges data, use sum of all meter balances as fallback
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

  // ── Derived data ──────────────────────────────────────────────

  const chartData = useMemo(() => {
    const monthMap: Record<string, number> = {};
    users.forEach(u => {
      const d = new Date(u.created_at);
      const key = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    let cumulative = 0;
    return Object.entries(monthMap).map(([month, count]) => {
      cumulative += count;
      return { month, newUsers: count, totalUsers: cumulative };
    });
  }, [users]);

  const recentActivity = useMemo(() =>
    users.slice(0, 6).map(u => ({
      id: u.id,
      name: u.name,
      action: u.onboarding_done ? 'Completed onboarding' : 'Signed up',
      time: new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }),
      initial: u.name.charAt(0).toUpperCase(),
    }))
  , [users]);

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Loading ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Loader2 style={{ width: 40, height: 40, color: C.accent }} className="animate-spin" />
          <p style={{ color: C.textSec, fontWeight: 500, fontSize: 14 }}>Loading admin dashboard...</p>
        </motion.div>
      </div>
    );
  }

  // ── Sidebar width ─────────────────────────────────────────────

  const sw = sidebarCollapsed ? 72 : 250;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.page, fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif" }}>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <aside style={{
        width: sw, minHeight: '100vh', background: C.sidebar,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s ease',
        position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{
          padding: sidebarCollapsed ? '24px 12px' : '24px 24px',
          display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap style={{ width: 22, height: 22, color: '#fff' }} fill="currentColor" />
          </div>
          {!sidebarCollapsed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 18, letterSpacing: 0.5 }}>VoltWise</span>
              <span style={{ display: 'block', color: C.accentLight, fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase' }}>Admin</span>
            </motion.div>
          )}
        </div>

        {/* Nav Items */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SidebarItem icon={LayoutDashboard} label="Dashboard" active={activePage === 'dashboard'} collapsed={sidebarCollapsed} onClick={() => setActivePage('dashboard')} />
          <SidebarItem icon={Users} label="Users" active={activePage === 'users'} collapsed={sidebarCollapsed} onClick={() => setActivePage('users')} badge={stats?.totalUsers} />
          <SidebarItem icon={Home} label="Homes" active={activePage === 'homes'} collapsed={sidebarCollapsed} onClick={() => setActivePage('homes')} badge={stats?.totalHomes} />
          <SidebarItem icon={BarChart3} label="Analytics" active={activePage === 'analytics'} collapsed={sidebarCollapsed} onClick={() => setActivePage('analytics')} />

          <div style={{ flex: 1 }} />

          {/* Collapse */}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{
            background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 10, padding: 10,
            color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 4, transition: 'all 0.2s',
          }}>
            <ChevronRight style={{ width: 18, height: 18, transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s' }} />
          </button>

          <SidebarItem icon={HelpCircle} label="Help & Info" active={false} collapsed={sidebarCollapsed} onClick={() => {}} />
          <SidebarItem icon={LogOut} label="Log out" active={false} collapsed={sidebarCollapsed} onClick={handleLogout} danger />
        </nav>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <main style={{
        flex: 1, marginLeft: sw, marginRight: 300,
        padding: '32px 36px', transition: 'margin-left 0.3s ease',
        minHeight: '100vh', overflowY: 'auto',
      }}>

        {/* Greeting */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
              Hello, {profile?.name?.split(' ')[0] || 'Admin'} 👋
            </h1>
            <p style={{ color: C.textSec, fontSize: 14, marginTop: 4 }}>
              Track platform progress here. You almost reach a goal!
            </p>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: C.muted }}>{today}</span>
            <button onClick={handleRefresh} disabled={refreshing} style={{
              width: 36, height: 36, borderRadius: 10, background: C.card,
              border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: C.textSec, transition: 'all 0.2s',
            }}>
              <RefreshCw style={{ width: 16, height: 16, animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 32 }}>
          <StatPill icon={Users} label="Total Users" value={stats?.totalUsers || 0}
            sub={`${stats?.activeUsers || 0} active`} iconBg={C.blueBg} iconColor={C.blue} delay={0} />
          <StatPill icon={DollarSign} label="Total Recharged"
            value={`₹${((stats?.totalRechargeAmount || 0) / 1000).toFixed(0)}K`}
            sub={`Avg ₹${(stats?.avgBalance || 0).toFixed(0)}`} iconBg={C.greenBg} iconColor={C.green} delay={0.1} />
          <StatPill icon={Home} label="Registered Homes" value={stats?.totalHomes || 0}
            sub={`${stats?.activeUsers || 0} onboarded`} iconBg={C.orangeBg} iconColor={C.orange} delay={0.2} />
        </div>

        {/* Performance Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          style={{ background: C.card, borderRadius: 20, padding: '24px 28px', border: `1px solid ${C.border}`, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>User Growth</h3>
            <span style={{ fontSize: 12, color: C.muted, background: C.page, padding: '6px 14px', borderRadius: 8, fontWeight: 500 }}>All time</span>
          </div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: C.sidebar, border: 'none', borderRadius: 12, padding: '10px 16px', boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
                  labelStyle={{ color: '#fff', fontWeight: 600, fontSize: 12 }} itemStyle={{ color: C.accentLight, fontSize: 12 }} />
                <Area type="monotone" dataKey="totalUsers" stroke={C.accent} strokeWidth={2.5} fill="url(#gradUsers)"
                  dot={{ r: 4, fill: C.accent, stroke: '#fff', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: C.accent, stroke: '#fff', strokeWidth: 2 }} name="Total Users" />
                <Line type="monotone" dataKey="newUsers" stroke={C.green} strokeWidth={2} strokeDasharray="5 5" dot={false} name="New Users" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Users Table */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ background: C.card, borderRadius: 20, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>All Users</h3>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, background: C.page, padding: '3px 10px', borderRadius: 6 }}>
                {filteredUsers.length} of {users.length}
              </span>
            </div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search style={{ position: 'absolute', left: 12, width: 16, height: 16, color: C.muted }} />
              <input type="text" placeholder="Search users..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  paddingLeft: 38, paddingRight: 16, paddingTop: 9, paddingBottom: 9,
                  border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13,
                  color: C.text, background: C.page, outline: 'none', width: 220, transition: 'border-color 0.2s',
                }}
                onFocus={(e) => { e.target.style.borderColor = C.accent; }}
                onBlur={(e) => { e.target.style.borderColor = C.border; }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.page }}>
                  {['User', 'Consumer No.', 'Home', 'Balance', 'Status', 'Joined', ''].map((h, i) => (
                    <th key={i} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: C.muted, fontSize: 14 }}>
                      {searchQuery ? 'No users match your search' : 'No users found'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, idx) => (
                    <tr key={user.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.page; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: `linear-gradient(135deg, ${GRAD[idx % 6][0]}, ${GRAD[idx % 6][1]})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 700, fontSize: 14,
                          }}>{user.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <p style={{ fontWeight: 600, color: C.text, fontSize: 13, margin: 0 }}>{user.name}</p>
                            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 13, color: C.textSec, fontFamily: 'monospace' }}>{user.consumer_number || '—'}</span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 13, color: C.textSec }}>{user.home_name || '—'}</span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: (user.balance || 0) > 100 ? C.green : C.pink }}>
                          ₹{(user.balance || 0).toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        {user.onboarding_done ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: C.greenBg, color: C.green, fontSize: 11, fontWeight: 600 }}>
                            <CheckCircle style={{ width: 12, height: 12 }} /> Active
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: C.orangeBg, color: C.orange, fontSize: 11, fontWeight: 600 }}>
                            <Clock style={{ width: 12, height: 12 }} /> Pending
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontSize: 12, color: C.muted }}>
                          {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <button onClick={() => setSelectedUser(user)}
                          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted, transition: 'all 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = C.accent; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}>
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

      {/* ═══ RIGHT PANEL ═══ */}
      <aside style={{
        width: 300, position: 'fixed', right: 0, top: 0, bottom: 0,
        background: C.card, borderLeft: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        {/* Admin Profile Card */}
        <div style={{ padding: '32px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: `linear-gradient(135deg, ${C.accent}, ${C.accentLight})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 12,
            boxShadow: `0 8px 24px ${C.accent}40`,
          }}>{profile?.name?.charAt(0).toUpperCase() || 'A'}</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{profile?.name || 'Admin'}</h3>
          <p style={{ fontSize: 12, color: C.accentLight, fontWeight: 600, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>
            @{profile?.role || 'admin'}
          </p>

          {/* Quick stats */}
          <div style={{ display: 'flex', gap: 16, marginTop: 20, width: '100%' }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: C.page, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>{stats?.activeUsers || 0}</p>
              <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>Active</p>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', background: C.page, borderRadius: 12 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>₹{(stats?.avgBalance || 0).toFixed(0)}</p>
              <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>Avg Bal</p>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div style={{ padding: '20px 24px' }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>Recent Activity</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {recentActivity.map((item, idx) => (
              <motion.div key={item.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * idx }} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${GRAD[idx % 6][0]}, ${GRAD[idx % 6][1]})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 700, fontSize: 13,
                }}>{item.initial}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{item.name}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>{item.action}</p>
                </div>
                <span style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap', marginTop: 2 }}>{item.time}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Platform Health */}
        <div style={{ margin: '0 24px', padding: 16, background: C.page, borderRadius: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Activity style={{ width: 14, height: 14, color: C.accent }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Platform Health</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <HealthBar label="Onboarding Rate" value={stats ? Math.round((stats.activeUsers / Math.max(stats.totalUsers, 1)) * 100) : 0} color={C.green} />
            <HealthBar label="Homes / Users" value={stats ? Math.round((stats.totalHomes / Math.max(stats.totalUsers, 1)) * 100) : 0} color={C.blue} />
          </div>
        </div>
      </aside>

      {/* ═══ USER DETAIL MODAL ═══ */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
        )}
      </AnimatePresence>

      {/* Keyframes & font */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
      `}</style>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════════

// ── Sidebar Nav Item ─────────────────────────────────────────────

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
  const bg = active ? C.sidebarActive : hovered ? C.sidebarHover : 'transparent';
  const color = danger ? '#ff6b6b' : active ? '#fff' : hovered ? '#dfe6e9' : '#b2bec3';

  return (
    <button onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: collapsed ? '10px' : '10px 16px', borderRadius: 12,
        border: 'none', background: bg, cursor: 'pointer', transition: 'all 0.2s',
        position: 'relative', justifyContent: collapsed ? 'center' : 'flex-start', width: '100%',
      }}>
      {active && <div style={{ position: 'absolute', left: -12, top: '50%', transform: 'translateY(-50%)', width: 4, height: 24, borderRadius: '0 4px 4px 0', background: C.accent }} />}
      <Icon style={{ width: 20, height: 20, color: active ? C.accentLight : color, flexShrink: 0, transition: 'color 0.2s' }} />
      {!collapsed && (
        <>
          <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, color, transition: 'color 0.2s', whiteSpace: 'nowrap' }}>{label}</span>
          {badge !== undefined && (
            <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: C.accentLight, background: 'rgba(108,92,231,0.15)', padding: '2px 8px', borderRadius: 6 }}>{badge}</span>
          )}
        </>
      )}
    </button>
  );
};

// ── Stat Pill ────────────────────────────────────────────────────

interface StatPillProps {
  icon: React.FC<{ style?: React.CSSProperties }>;
  label: string;
  value: string | number;
  sub: string;
  iconBg: string;
  iconColor: string;
  delay: number;
}

const StatPill: React.FC<StatPillProps> = ({ icon: Icon, label, value, sub, iconBg, iconColor, delay }) => (
  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
    whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
    style={{
      background: C.card, borderRadius: 18, padding: '22px 24px',
      border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16,
      cursor: 'default', transition: 'box-shadow 0.3s, transform 0.3s',
    }}>
    <div style={{ width: 48, height: 48, borderRadius: 14, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon style={{ width: 22, height: 22, color: iconColor }} />
    </div>
    <div>
      <p style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0', fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: 10, color: C.green, margin: '2px 0 0', fontWeight: 600 }}>{sub}</p>
    </div>
  </motion.div>
);

// ── Health Bar ───────────────────────────────────────────────────

const HealthBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: C.textSec, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.text, fontWeight: 700 }}>{value}%</span>
    </div>
    <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }}
        transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
        style={{ height: '100%', borderRadius: 3, background: color }} />
    </div>
  </div>
);

// ── User Detail Modal ────────────────────────────────────────────

interface UserDetailModalProps {
  user: UserData;
  onClose: () => void;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ user, onClose }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    onClick={onClose}>
    <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}
      style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.15)' }}>
      {/* Modal Header */}
      <div style={{ padding: '28px 28px 20px', background: `linear-gradient(135deg, ${C.sidebar}, #2d2d44)`, color: '#fff', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.1)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
          <X style={{ width: 16, height: 16 }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, ${C.accentLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff' }}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{user.name}</h2>
            <p style={{ fontSize: 13, color: C.accentLight, margin: '2px 0 0' }}>{user.email}</p>
          </div>
        </div>
      </div>
      {/* Modal Body */}
      <div style={{ padding: '20px 28px 28px' }}>
        <DetailRow label="Phone" value={user.phone || 'Not provided'} />
        <DetailRow label="Consumer Number" value={user.consumer_number || 'Not linked'} />
        <DetailRow label="Home" value={user.home_name || 'No home registered'} />
        <DetailRow label="Meter Number" value={user.meter_number || 'No meter'} />
        <DetailRow label="Current Balance" value={`₹${(user.balance || 0).toFixed(2)}`} highlight />
        <DetailRow label="Role" value={user.role} />
        <DetailRow label="Status" value={user.onboarding_done ? 'Active' : 'Onboarding Pending'} />
        <DetailRow label="Joined" value={new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} />
      </div>
    </motion.div>
  </motion.div>
);

const DetailRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
    <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: highlight ? C.green : C.text }}>{value}</span>
  </div>
);

export default AdminDashboard;
