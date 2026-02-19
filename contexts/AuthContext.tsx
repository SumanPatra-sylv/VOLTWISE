import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────
export interface User {
    id: string;
    name: string;
    initials: string;
    email: string;
    location: string;
    tariffPlan: string;
    householdMembers: number;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

interface AuthContextType extends AuthState {
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    signup: (name: string, email: string, password: string) => Promise<void>;
}

// ── Mock user (until backend is ready) ─────────────────────────────
const MOCK_USER: User = {
    id: 'usr_001',
    name: 'Rohit Sharma',
    initials: 'RS',
    email: 'rohit@example.com',
    location: 'Bangalore, KA',
    tariffPlan: 'ToD (Peak/Off)',
    householdMembers: 4,
};

// ── Context ────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        user: MOCK_USER,             // Auto-login for demo
        isAuthenticated: true,       // Auto-login for demo
        isLoading: false,
    });

    const login = useCallback(async (_email: string, _password: string) => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            // TODO: Replace with real API call
            // const response = await api.login(email, password);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network
            setState({
                user: MOCK_USER,
                isAuthenticated: true,
                isLoading: false,
            });
        } catch (error) {
            setState(prev => ({ ...prev, isLoading: false }));
            throw error;
        }
    }, []);

    const logout = useCallback(() => {
        // TODO: Clear tokens, call logout API
        setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
        });
    }, []);

    const signup = useCallback(async (_name: string, _email: string, _password: string) => {
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            // TODO: Replace with real API call
            await new Promise(resolve => setTimeout(resolve, 500));
            setState({
                user: MOCK_USER,
                isAuthenticated: true,
                isLoading: false,
            });
        } catch (error) {
            setState(prev => ({ ...prev, isLoading: false }));
            throw error;
        }
    }, []);

    return (
        <AuthContext.Provider value={{ ...state, login, logout, signup }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
