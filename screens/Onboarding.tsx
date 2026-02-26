import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronRight, ChevronLeft, Loader2, Eye, EyeOff, AlertCircle, CheckCircle2, Search, Shield } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { DBConsumerMaster } from '../types/database';

// ── Types ───────────────────────────────────────────────────────────

type OnboardingStep = 'welcome' | 'signup' | 'login' | 'admin-login' | 'consumer' | 'done';

const Onboarding: React.FC = () => {
  const { user, profile, signUp, signIn, lookupConsumer, completeOnboarding } = useApp();

  // Determine initial step based on auth state
  const getInitialStep = (): OnboardingStep => {
    if (!user) return 'welcome';
    if (user && profile && !profile.onboarding_done) return 'consumer';
    return 'welcome';
  };

  const [step, setStep] = useState<OnboardingStep>(getInitialStep);

  // ── Form state ─────────────────────────────────────────────────
  // Signup/Login
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Consumer lookup
  const [consumerNumber, setConsumerNumber] = useState('');
  const [consumerData, setConsumerData] = useState<DBConsumerMaster | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── If user is logged in but not onboarded, jump to consumer ───
  // ── Skip for admin users — they don't need consumer linking ────
  useEffect(() => {
    if (user && (step === 'welcome' || step === 'signup' || step === 'login' || step === 'admin-login')) {
      // Admin users: App.tsx will handle routing to AdminDashboard
      if (profile?.role === 'admin' || profile?.role === 'super_admin') {
        // Profile loaded, admin detected — App.tsx will redirect
        return;
      }
      // Regular users: if onboarding not done (or profile missing), go to consumer step
      if (!profile || !profile.onboarding_done) {
        setStep('consumer');
        setLoading(false);
        setError('');
      }
    }
  }, [user, profile]);

  // ── Handle signup ──────────────────────────────────────────────
  const handleSignup = async () => {
    if (!name.trim()) return setError('Name is required');
    if (!email.trim()) return setError('Email is required');
    if (!password || password.length < 6) return setError('Password must be at least 6 characters');

    setLoading(true);
    setError('');

    const { error } = await signUp(email, password, { name, phone });

    if (error) {
      setError(error.message || 'Signup failed');
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep('consumer');
  };

  // ── Handle login ───────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');

    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message || 'Login failed');
      setLoading(false);
      return;
    }

    setLoading(false);
    // Auth listener handles the rest — if onboarding not done, useEffect jumps to consumer
  };

  // ── Handle admin login ─────────────────────────────────────────
  const handleAdminLogin = async () => {
    if (!email.trim()) return setError('Email is required');
    if (!password) return setError('Password is required');

    setLoading(true);
    setError('');

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message || 'Login failed');
      setLoading(false);
      return;
    }

    // Check if user has admin role - profile will be loaded by the auth listener
    // The App.tsx will handle routing to AdminDashboard based on role
    setLoading(false);
  };

  // ── Lookup consumer number ─────────────────────────────────────
  const handleLookup = async () => {
    if (!consumerNumber.trim()) return setError('Enter your consumer number');
    if (consumerNumber.length < 10) return setError('Consumer number must be at least 10 digits');

    setLoading(true);
    setError('');
    setConsumerData(null);
    setLookupDone(false);

    const { data, error } = await lookupConsumer(consumerNumber);

    if (error || !data) {
      setError('Consumer number not found. Check your electricity bill for the correct number.');
      setLoading(false);
      return;
    }

    setConsumerData(data);
    setLookupDone(true);
    setLoading(false);
  };

  // ── Handle link & complete ─────────────────────────────────────
  const handleComplete = async () => {
    if (!consumerData) return setError('Please verify your consumer number first');

    setLoading(true);
    setError('');

    const { error } = await completeOnboarding(consumerNumber);

    if (error) {
      setError(typeof error === 'string' ? error : 'Failed to complete setup');
      setLoading(false);
      return;
    }

    setStep('done');
    setLoading(false);
  };

  // ── Slide animation ────────────────────────────────────────────
  const slideVariants = {
    enter: { x: 60, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -60, opacity: 0 },
  };

  // ── Input class helper ─────────────────────────────────────────
  const inputClass = "w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all";

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen bg-slate-50 flex items-center justify-center">
      <div className="w-full max-w-md mx-auto px-6 py-8 min-h-screen flex flex-col">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-wide">VOLTWISE</span>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex-1 flex flex-col"
          >

            {/* ── WELCOME ──────────────────────────────────────── */}
            {step === 'welcome' && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="text-3xl font-bold text-slate-900 mb-3">
                  See Every Watt,<br />Save Every Rupee.
                </h1>
                <p className="text-slate-500 mb-10 text-lg">
                  AI-powered electricity management for your home.
                </p>
                <button
                  onClick={() => { setStep('signup'); setError(''); }}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-semibold text-lg mb-3 hover:bg-slate-800 transition-colors"
                >
                  Create Account
                </button>
                <button
                  onClick={() => { setStep('login'); setError(''); }}
                  className="w-full py-4 bg-white text-slate-700 rounded-2xl font-semibold text-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  I have an account
                </button>

                {/* Admin Login Link */}
                <button
                  onClick={() => { setStep('admin-login'); setError(''); }}
                  className="mt-6 flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors"
                >
                  <Shield className="w-4 h-4" />
                  Login as Admin
                </button>
              </div>
            )}

            {/* ── SIGNUP ───────────────────────────────────────── */}
            {step === 'signup' && (
              <div className="flex-1 flex flex-col">
                <button onClick={() => setStep('welcome')} className="flex items-center text-slate-500 mb-6 hover:text-slate-700">
                  <ChevronLeft className="w-5 h-5" /> Back
                </button>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h2>
                <p className="text-slate-500 mb-6">Start saving on electricity today.</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Full Name *</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Email *</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Phone</label>
                    <input
                      type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="+91 XXXXX XXXXX"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Password *</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className={`${inputClass} pr-12`}
                      />
                      <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" type="button">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  onClick={handleSignup}
                  disabled={loading}
                  className="mt-6 w-full py-4 bg-slate-900 text-white rounded-2xl font-semibold text-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Continue</span><ChevronRight className="w-5 h-5" /></>}
                </button>

                <p className="text-center text-sm text-slate-500 mt-4">
                  Already have an account?{' '}
                  <button onClick={() => { setStep('login'); setError(''); }} className="text-cyan-600 font-medium hover:underline">Login</button>
                </p>
              </div>
            )}

            {/* ── LOGIN ────────────────────────────────────────── */}
            {step === 'login' && (
              <div className="flex-1 flex flex-col">
                <button onClick={() => setStep('welcome')} className="flex items-center text-slate-500 mb-6 hover:text-slate-700">
                  <ChevronLeft className="w-5 h-5" /> Back
                </button>
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
                <p className="text-slate-500 mb-6">Sign in to access your dashboard.</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Email</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        className={`${inputClass} pr-12`}
                      />
                      <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" type="button">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  onClick={handleLogin}
                  disabled={loading}
                  className="mt-6 w-full py-4 bg-slate-900 text-white rounded-2xl font-semibold text-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Sign In</span>}
                </button>

                <p className="text-center text-sm text-slate-500 mt-4">
                  Don't have an account?{' '}
                  <button onClick={() => { setStep('signup'); setError(''); }} className="text-cyan-600 font-medium hover:underline">Create one</button>
                </p>
              </div>
            )}

            {/* ── ADMIN LOGIN ──────────────────────────────────── */}
            {step === 'admin-login' && (
              <div className="flex-1 flex flex-col">
                <button onClick={() => setStep('welcome')} className="flex items-center text-slate-500 mb-6 hover:text-slate-700">
                  <ChevronLeft className="w-5 h-5" /> Back
                </button>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Admin Login</h2>
                    <p className="text-slate-500 text-sm">Restricted access only</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Admin Email</label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      placeholder="admin@voltwise.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Enter admin password"
                        className={`${inputClass} pr-12`}
                      />
                      <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" type="button">
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  onClick={handleAdminLogin}
                  disabled={loading}
                  className="mt-6 w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-semibold text-lg hover:from-purple-700 hover:to-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-200"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Shield className="w-5 h-5" /><span>Access Admin Panel</span></>}
                </button>

                <p className="text-center text-xs text-slate-400 mt-4">
                  Only authorized administrators can access this area.
                </p>
              </div>
            )}

            {/* ── CONSUMER NUMBER (Auto-lookup) ────────────────── */}
            {step === 'consumer' && (
              <div className="flex-1 flex flex-col">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Link your meter</h2>
                <p className="text-slate-500 mb-6">Enter your consumer number from your electricity bill. We'll auto-detect your DISCOM and setup your account.</p>

                <div className="space-y-4">
                  {/* Consumer number input with lookup button */}
                  <div>
                    <label className="text-sm font-medium text-slate-600 mb-1 block">Consumer Number</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={consumerNumber}
                        onChange={e => {
                          setConsumerNumber(e.target.value.replace(/\D/g, ''));
                          setConsumerData(null);
                          setLookupDone(false);
                          setError('');
                        }}
                        placeholder="Enter 10-12 digit number"
                        className={`${inputClass} font-mono tracking-wider flex-1`}
                        maxLength={14}
                      />
                      <button
                        onClick={handleLookup}
                        disabled={loading || consumerNumber.length < 10}
                        className="px-5 bg-cyan-600 text-white rounded-xl font-medium hover:bg-cyan-700 transition-colors disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Verify
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Found on your electricity bill or prepaid meter receipt</p>
                  </div>

                  {/* Auto-detected details card */}
                  {lookupDone && consumerData && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-5 h-5" />
                        Consumer Verified
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        <div>
                          <span className="text-emerald-500">DISCOM</span>
                          <p className="font-medium text-slate-800">{consumerData.discom_code}</p>
                        </div>
                        <div>
                          <span className="text-emerald-500">State</span>
                          <p className="font-medium text-slate-800">{consumerData.state}</p>
                        </div>
                        <div>
                          <span className="text-emerald-500">Meter</span>
                          <p className="font-medium text-slate-800">{consumerData.meter_number}</p>
                        </div>
                        <div>
                          <span className="text-emerald-500">Type</span>
                          <p className="font-medium text-slate-800 capitalize">{consumerData.connection_type}</p>
                        </div>
                        {consumerData.registered_name && (
                          <div className="col-span-2">
                            <span className="text-emerald-500">Registered to</span>
                            <p className="font-medium text-slate-800">{consumerData.registered_name}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-emerald-500">Load</span>
                          <p className="font-medium text-slate-800">{consumerData.sanctioned_load_kw} kW</p>
                        </div>
                        <div>
                          <span className="text-emerald-500">Category</span>
                          <p className="font-medium text-slate-800 capitalize">{consumerData.tariff_category}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Demo hint */}
                  <div className="bg-slate-100 rounded-xl px-4 py-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-600">Demo consumer numbers:</span>
                    <br />
                    SBPDCL (Bihar): <code className="bg-white px-1.5 py-0.5 rounded text-slate-700">100100100101</code>
                    <br />
                    MGVCL (Gujarat): <code className="bg-white px-1.5 py-0.5 rounded text-slate-700">10010010201</code>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-center gap-2 text-red-600 text-sm bg-red-50 px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                  </div>
                )}

                <button
                  onClick={handleComplete}
                  disabled={loading || !lookupDone || !consumerData}
                  className="mt-6 w-full py-4 bg-slate-900 text-white rounded-2xl font-semibold text-lg hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><span>Link Account</span><Zap className="w-5 h-5 text-yellow-400" /></>}
                </button>
              </div>
            )}

            {/* ── DONE ─────────────────────────────────────────── */}
            {step === 'done' && (
              <div className="flex-1 flex flex-col justify-center items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                  className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6"
                >
                  <Zap className="w-10 h-10 text-emerald-600 fill-emerald-600" />
                </motion.div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">You're all set!</h2>
                <p className="text-slate-500 mb-8">
                  Your {consumerData?.discom_code} meter ({consumerData?.meter_number}) is linked.<br />
                  Start saving on your electricity bills.
                </p>
                <p className="text-sm text-slate-400">Redirecting to dashboard...</p>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Onboarding;