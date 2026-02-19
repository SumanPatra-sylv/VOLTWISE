import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    public state: ErrorBoundaryState = {
        hasError: false,
        error: null,
    };

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[VoltWise] Uncaught error:', error, errorInfo);
        // TODO: Send to error tracking service (Sentry, etc.)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-8 min-h-[300px] text-center">
                    <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mb-4">
                        <AlertTriangle className="w-8 h-8 text-rose-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                        Something went wrong
                    </h3>
                    <p className="text-sm text-slate-500 mb-6 max-w-xs">
                        An unexpected error occurred. Please try again.
                    </p>
                    <button
                        onClick={this.handleReset}
                        className="px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center gap-2 hover:scale-105 transition-transform shadow-lg"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>
                    {this.state.error && (
                        <pre className="mt-4 p-3 bg-slate-100 rounded-lg text-xs text-left text-rose-600 max-w-sm overflow-auto">
                            {this.state.error.message}
                        </pre>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
