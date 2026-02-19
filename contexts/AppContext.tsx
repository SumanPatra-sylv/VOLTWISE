import React, { createContext, useContext, useState, ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────
export type ViewMode = 'mobile' | 'tablet' | 'web';

interface AppContextType {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
    onboardingComplete: boolean;
    setOnboardingComplete: (complete: boolean) => void;
}

// ── Context ────────────────────────────────────────────────────────
const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('mobile');
    const [onboardingComplete, setOnboardingComplete] = useState(false);

    return (
        <AppContext.Provider
            value={{
                viewMode,
                setViewMode,
                onboardingComplete,
                setOnboardingComplete,
            }}
        >
            {children}
        </AppContext.Provider>
    );
};

export const useApp = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
