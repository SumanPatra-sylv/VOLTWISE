import { useState, useEffect, useCallback } from 'react';

/**
 * Generic hook for API calls with loading/error states.
 * 
 * Usage:
 * const { data, loading, error, refetch } = useApi(getDashboardStats);
 * const { data, loading, error, refetch } = useApi(() => getBillHistory(2024));
 */

interface UseApiState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
    refetch: () => void;
}

export function useApi<T>(
    fetcher: () => Promise<T>,
    deps: unknown[] = []
): UseApiReturn<T> {
    const [state, setState] = useState<UseApiState<T>>({
        data: null,
        loading: true,
        error: null,
    });

    const fetchData = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const result = await fetcher();
            setState({ data: result, loading: false, error: null });
        } catch (err) {
            setState({
                data: null,
                loading: false,
                error: err instanceof Error ? err : new Error(String(err)),
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return {
        ...state,
        refetch: fetchData,
    };
}

/**
 * Hook for mutations (POST/PUT/DELETE) — doesn't auto-fetch.
 * 
 * Usage:
 * const { execute, loading, error } = useMutation(toggleAppliance);
 * await execute('appliance-1', true);
 */

interface UseMutationReturn<TArgs extends unknown[], TResult> {
    execute: (...args: TArgs) => Promise<TResult | null>;
    loading: boolean;
    error: Error | null;
}

export function useMutation<TArgs extends unknown[], TResult>(
    mutator: (...args: TArgs) => Promise<TResult>
): UseMutationReturn<TArgs, TResult> {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const execute = useCallback(async (...args: TArgs): Promise<TResult | null> => {
        setLoading(true);
        setError(null);
        try {
            const result = await mutator(...args);
            setLoading(false);
            return result;
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            setError(error);
            setLoading(false);
            return null;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { execute, loading, error };
}
