import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { DBProfile, DBHome, DBMeter, DBConsumerMaster } from '../types/database';

// ── Types ──────────────────────────────────────────────────────────

export type ViewMode = 'mobile' | 'tablet' | 'web';

interface AuthState {
    user: User | null;
    session: Session | null;
    profile: DBProfile | null;
    home: DBHome | null;
    meter: DBMeter | null;
}

interface AppContextType {
    // View mode (desktop preview)
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;

    // Auth state
    user: User | null;
    session: Session | null;
    profile: DBProfile | null;
    home: DBHome | null;
    meter: DBMeter | null;

    // Loading states
    isLoading: boolean;  // Initial auth check
    isAuthReady: boolean; // Auth listener has fired at least once

    // Auth actions
    signUp: (email: string, password: string, metadata: { name: string; phone: string }) => Promise<{ error: any }>;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signOut: () => Promise<void>;

    // Data refresh
    refreshProfile: () => Promise<void>;
    refreshHome: () => Promise<void>;
    refreshMeter: () => Promise<void>;

    // Onboarding — just needs consumer number, auto-derives everything else
    lookupConsumer: (consumerNumber: string) => Promise<{ data: DBConsumerMaster | null; error: any }>;
    completeOnboarding: (consumerNumber: string) => Promise<{ error: any }>;
}

// ── Context ────────────────────────────────────────────────────────

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ───────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('mobile');
    const [authState, setAuthState] = useState<AuthState>({
        user: null,
        session: null,
        profile: null,
        home: null,
        meter: null,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // ── Timeout helper — prevents hanging on unresponsive Supabase ──

    const withTimeout = <T,>(promise: Promise<T>, ms = 8000): Promise<T> =>
        Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
            ),
        ]);

    // ── Fetch profile → home → meter chain ─────────────────────────

    const fetchProfile = useCallback(async (userId: string): Promise<DBProfile | null> => {
        const { data, error } = await withTimeout(
            Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).single())
        );

        if (error) {
            if (error.code === 'PGRST116') return null; // no profile yet
            console.error('Failed to fetch profile:', error.message);
            return null;
        }
        return data as DBProfile;
    }, []);

    const fetchPrimaryHome = useCallback(async (userId: string): Promise<DBHome | null> => {
        const { data, error } = await withTimeout(
            Promise.resolve(supabase.from('homes').select('*').eq('user_id', userId).eq('is_primary', true).single())
        );

        if (error) {
            if (error.code === 'PGRST116') return null;
            console.error('Failed to fetch home:', error.message);
            return null;
        }
        return data as DBHome;
    }, []);

    const fetchActiveMeter = useCallback(async (homeId: string): Promise<DBMeter | null> => {
        const { data, error } = await withTimeout(
            Promise.resolve(supabase.from('meters').select('*').eq('home_id', homeId).eq('is_active', true)
                .order('created_at', { ascending: false }).limit(1).single())
        );

        if (error) {
            if (error.code === 'PGRST116') return null;
            console.error('Failed to fetch meter:', error.message);
            return null;
        }
        return data as DBMeter;
    }, []);

    // ── Load full user data chain ──────────────────────────────────

    const loadUserData = useCallback(async (user: User, session: Session) => {
        try {
            console.log('[Auth] Loading user data for:', user.id);
            const profile = await fetchProfile(user.id);
            console.log('[Auth] Profile:', profile ? 'found' : 'not found', profile?.onboarding_done ? '(onboarded)' : '(not onboarded)');

            let home: DBHome | null = null;
            let meter: DBMeter | null = null;

            if (profile?.onboarding_done) {
                home = await fetchPrimaryHome(user.id);
                if (home) {
                    meter = await fetchActiveMeter(home.id);
                }
                console.log('[Auth] Home:', home?.name || 'none', '| Meter:', meter?.meter_number || 'none');
            }

            setAuthState({ user, session, profile, home, meter });
        } catch (err) {
            console.error('[Auth] loadUserData failed:', err);
            // Still set the user/session so the app doesn't hang on splash
            setAuthState(prev => ({ ...prev, user, session }));
        }
    }, [fetchProfile, fetchPrimaryHome, fetchActiveMeter]);

    // ── Auth listener ──────────────────────────────────────────────

    useEffect(() => {
        let handled = false;

        const initAuth = async (user: User, session: Session) => {
            if (handled) return;
            handled = true;
            await loadUserData(user, session);
            setIsLoading(false);
            setIsAuthReady(true);
        };

        // Get initial session
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            console.log('[Auth] Initial session:', session ? 'exists' : 'none');
            if (session?.user) {
                await initAuth(session.user, session);
            } else {
                setIsLoading(false);
                setIsAuthReady(true);
            }
        }).catch(err => {
            console.error('[Auth] getSession failed:', err);
            setIsLoading(false);
            setIsAuthReady(true);
        });

        // Listen for auth changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('[Auth]', event);

                if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
                    await initAuth(session.user, session);
                } else if (event === 'SIGNED_OUT') {
                    handled = false;
                    setAuthState({ user: null, session: null, profile: null, home: null, meter: null });
                } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                    setAuthState(prev => ({ ...prev, user: session.user, session }));
                }
            }
        );

        // Safety net — if nothing fires within 10 seconds, release the splash screen
        const safetyTimeout = setTimeout(() => {
            setIsLoading(false);
            setIsAuthReady(true);
            console.warn('[Auth] Safety timeout — releasing splash screen');
        }, 10000);

        return () => {
            subscription.unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, [loadUserData]);

    // ── Auth actions ───────────────────────────────────────────────

    const signUp = async (email: string, password: string, metadata: { name: string; phone: string }) => {
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name: metadata.name,
                    phone: metadata.phone,
                },
            },
        });
        return { error };
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error };
    };

    const signOut = async () => {
        await supabase.auth.signOut();
    };

    // ── Data refresh ───────────────────────────────────────────────

    const refreshProfile = useCallback(async () => {
        if (!authState.user) return;
        const profile = await fetchProfile(authState.user.id);
        if (profile) {
            setAuthState(prev => ({ ...prev, profile }));
        }
    }, [authState.user, fetchProfile]);

    const refreshHome = useCallback(async () => {
        if (!authState.user) return;
        const home = await fetchPrimaryHome(authState.user.id);
        if (home) {
            const meter = await fetchActiveMeter(home.id);
            setAuthState(prev => ({ ...prev, home, meter }));
        }
    }, [authState.user, fetchPrimaryHome, fetchActiveMeter]);

    const refreshMeter = useCallback(async () => {
        if (!authState.home) return;
        const meter = await fetchActiveMeter(authState.home.id);
        if (meter) {
            setAuthState(prev => ({ ...prev, meter }));
        }
    }, [authState.home, fetchActiveMeter]);

    // ── Lookup consumer in consumer_master ─────────────────────────
    // Simulates: GET /consumer/{consumer_id} from DISCOM/IntelliSmart API

    const lookupConsumer = async (consumerNumber: string) => {
        const { data, error } = await supabase
            .from('consumer_master')
            .select('*')
            .eq('consumer_number', consumerNumber)
            .eq('is_active', true)
            .single();

        if (error || !data) {
            return { data: null, error: error?.message || 'Consumer number not found' };
        }
        return { data: data as DBConsumerMaster, error: null };
    };

    // ── Complete onboarding ────────────────────────────────────────
    // Just needs consumer number — auto-derives DISCOM, state, meter, tariff

    const completeOnboarding = async (consumerNumber: string) => {
        if (!authState.user) return { error: 'Not authenticated' };

        try {
            // 1. Lookup consumer in master table
            const { data: consumer, error: lookupErr } = await lookupConsumer(consumerNumber);
            if (lookupErr || !consumer) throw new Error(lookupErr || 'Consumer number not found');

            // 2. Find active tariff plan for this DISCOM
            const { data: tariffPlan, error: tariffErr } = await supabase
                .from('tariff_plans')
                .select('id')
                .eq('discom_id', consumer.discom_id)
                .eq('category', consumer.tariff_category)
                .eq('is_active', true)
                .order('effective_from', { ascending: false })
                .limit(1)
                .single();

            if (tariffErr || !tariffPlan) throw new Error('No active tariff plan found for your DISCOM');

            // 3. Update profile with consumer number
            const { error: profileErr } = await supabase
                .from('profiles')
                .update({
                    consumer_number: consumerNumber,
                    location: `${consumer.state}`,
                    onboarding_done: true,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', authState.user.id);

            if (profileErr) throw profileErr;

            // 4. Create home (auto-populated from consumer_master)
            const { data: newHome, error: homeErr } = await supabase
                .from('homes')
                .insert({
                    user_id: authState.user.id,
                    name: 'My Home',
                    state: consumer.state,
                    discom_id: consumer.discom_id,
                    tariff_plan_id: tariffPlan.id,
                    tariff_category: consumer.tariff_category,
                    sanctioned_load_kw: consumer.sanctioned_load_kw,
                    is_primary: true,
                })
                .select()
                .single();

            if (homeErr) throw homeErr;

            // 5. Create meter (meter_number from consumer_master)
            const { data: newMeter, error: meterErr } = await supabase
                .from('meters')
                .insert({
                    home_id: newHome.id,
                    meter_number: consumer.meter_number,
                    meter_type: consumer.connection_type,
                    is_active: true,
                    balance_amount: 0,
                    last_recharge_amount: 0,
                })
                .select()
                .single();

            if (meterErr) throw meterErr;

            // 6. Refresh auth state with new data
            const profile = await fetchProfile(authState.user.id);
            setAuthState(prev => ({
                ...prev,
                profile,
                home: newHome as DBHome,
                meter: newMeter as DBMeter,
            }));

            return { error: null };
        } catch (err: any) {
            console.error('Onboarding error:', err);
            return { error: err.message || 'Failed to complete onboarding' };
        }
    };

    // ── Context value ──────────────────────────────────────────────

    const value: AppContextType = {
        viewMode,
        setViewMode,
        user: authState.user,
        session: authState.session,
        profile: authState.profile,
        home: authState.home,
        meter: authState.meter,
        isLoading,
        isAuthReady,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        refreshHome,
        refreshMeter,
        lookupConsumer,
        completeOnboarding,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

// ── Hook ─────────────────────────────────────────────────────────

export const useApp = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
