import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Zap, Home, Activity, Search, Filter, ChevronDown, ChevronRight,
  LogOut, MoreVertical, Eye, TrendingUp, TrendingDown, DollarSign,
  AlertTriangle, CheckCircle, Clock, X, Loader2, RefreshCw
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { supabase } from '../services/supabase';

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
  totalRecharges: number;
  totalRechargeAmount: number;
  avgBalance: number;
}

const AdminDashboard: React.FC = () => {
  const { signOut, profile } = useApp();
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
      const { data: recharges } = await supabase.from('recharges').select('amount').eq('status', 'completed');
      const { data: meters } = await supabase.from('meters').select('balance_amount');

      const totalRechargeAmount = recharges?.reduce((sum, r) => sum + Number(r.amount), 0) || 0;
      const avgBalance = meters?.length ? meters.reduce((sum, m) => sum + Number(m.balance_amount || 0), 0) / meters.length : 0;

      setStats({
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        totalHomes: totalHomes || 0,
        totalRecharges: recharges?.length || 0,
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-slate-500 font-medium">Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">VoltWise Admin</h1>
                <p className="text-xs text-slate-400">Welcome, {profile?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats?.totalUsers || 0}
            color="bg-blue-500"
          />
          <StatCard
            icon={CheckCircle}
            label="Active Users"
            value={stats?.activeUsers || 0}
            color="bg-emerald-500"
          />
          <StatCard
            icon={Home}
            label="Homes"
            value={stats?.totalHomes || 0}
            color="bg-purple-500"
          />
          <StatCard
            icon={Activity}
            label="Recharges"
            value={stats?.totalRecharges || 0}
            color="bg-orange-500"
          />
          <StatCard
            icon={DollarSign}
            label="Total Recharged"
            value={`₹${(stats?.totalRechargeAmount || 0).toLocaleString()}`}
            color="bg-cyan-500"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Balance"
            value={`₹${(stats?.avgBalance || 0).toFixed(0)}`}
            color="bg-rose-500"
          />
        </div>

        {/* User Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-slate-800">All Users</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full sm:w-64 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Consumer No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Home</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Joined</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      {searchQuery ? 'No users match your search' : 'No users found'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{user.name}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600 font-mono">
                          {user.consumer_number || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-600">
                          {user.home_name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-sm font-semibold ${(user.balance || 0) > 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          ₹{(user.balance || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {user.onboarding_done ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-medium">
                            <CheckCircle className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-medium">
                            <Clock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-slate-500">
                          {new Date(user.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <button
                          onClick={() => setSelectedUser(user)}
                          className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-500">
              Showing {filteredUsers.length} of {users.length} users
            </p>
          </div>
        </div>
      </main>

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <UserDetailModal user={selectedUser} onClose={() => setSelectedUser(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Stat Card Component ────────────────────────────────────────────
interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, color }) => (
  <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
    <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
      <Icon className="w-5 h-5 text-white" />
    </div>
    <p className="text-2xl font-bold text-slate-800">{value}</p>
    <p className="text-xs text-slate-400 font-medium">{label}</p>
  </div>
);

// ── User Detail Modal ──────────────────────────────────────────────
interface UserDetailModalProps {
  user: UserData;
  onClose: () => void;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ user, onClose }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    onClick={onClose}
  >
    <motion.div
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.95, opacity: 0 }}
      onClick={(e) => e.stopPropagation()}
      className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl"
    >
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{user.name}</h2>
              <p className="text-sm text-slate-400">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
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
  <div className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
    <span className="text-sm text-slate-500">{label}</span>
    <span className={`text-sm font-medium ${highlight ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</span>
  </div>
);

export default AdminDashboard;
