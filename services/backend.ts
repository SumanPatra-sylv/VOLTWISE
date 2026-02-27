/**
 * Backend API Client — Communicates with VoltWise FastAPI backend.
 *
 * Every control action (toggle, eco-mode, schedule, batch turn-off)
 * goes through the backend so that:
 *  1. Tuya smart plugs are actually toggled
 *  2. APScheduler registers time-based jobs
 *  3. control_logs and schedule_logs are written server-side
 *
 * Auth: passes the Supabase JWT from the current session.
 */

import { supabase } from './supabase';

const API_BASE = '/api';

// ── Auth header helper ────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token ?? '';
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
    };
}

// ── Generic fetcher ───────────────────────────────────────────────

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `API error ${res.status}`);
    }
    return res.json();
}

// ── Types ─────────────────────────────────────────────────────────

export interface ToggleResponse {
    success: boolean;
    source: string;
    new_status: string;
    response_time_ms: number;
    message: string;
}

export interface ScheduleResponse {
    schedule_id: string;
    appliance_id: string;
    start_time: string;
    end_time: string | null;
    message: string;
}

export interface BatchTurnOffResponse {
    success: boolean;
    turned_off: number;
    results: Array<{
        appliance_id: string;
        success: boolean;
        source?: string;
        error?: string;
    }>;
}

// ── API methods ───────────────────────────────────────────────────

/**
 * Toggle an appliance ON or OFF via the backend adapter pipeline.
 */
export async function toggleAppliance(
    applianceId: string,
    action: 'turn_on' | 'turn_off',
): Promise<ToggleResponse> {
    return apiFetch<ToggleResponse>(`/appliances/${applianceId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ action }),
    });
}

/**
 * Set eco mode for a comfort-tier appliance.
 */
export async function setEcoMode(
    applianceId: string,
    enabled: boolean,
): Promise<ToggleResponse> {
    return apiFetch<ToggleResponse>(`/appliances/${applianceId}/eco-mode`, {
        method: 'POST',
        body: JSON.stringify({ enabled }),
    });
}

/**
 * Create a schedule via the backend (APScheduler registers the jobs).
 */
export async function createSchedule(
    applianceId: string,
    startTime: string,
    endTime: string | null,
    repeatType: string = 'once',
    customDays: number[] | null = null,
): Promise<ScheduleResponse> {
    return apiFetch<ScheduleResponse>(`/appliances/${applianceId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({
            start_time: startTime,
            end_time: endTime,
            repeat_type: repeatType,
            custom_days: customDays,
        }),
    });
}

/**
 * Batch turn off multiple heavy appliances (optimizer).
 */
export async function batchTurnOff(
    applianceIds: string[],
): Promise<BatchTurnOffResponse> {
    return apiFetch<BatchTurnOffResponse>('/optimizer/execute', {
        method: 'POST',
        body: JSON.stringify({ appliance_ids: applianceIds }),
    });
}

/**
 * Health check — useful to verify backend is running.
 */
export async function healthCheck(): Promise<{ status: string }> {
    return apiFetch('/health');
}

// ── Autopilot API ─────────────────────────────────────────────────

export interface AutopilotRule {
    id: string;
    home_id: string;
    name: string;
    description: string | null;
    condition_type: string;
    condition_value: Record<string, any>;
    target_appliance_ids: string[];
    action: string;
    is_active: boolean;
    is_triggered: boolean;
    last_triggered: string | null;
}

export interface AutopilotStatus {
    enabled: boolean;
    rules_count: number;
    active_rules: number;
    triggered_rules: number;
    protected_appliances: number;
    mode: string;
}

export interface SimulationResult {
    would_affect: Array<{
        appliance_id: string;
        name: string;
        current_status: string;
        action: string;
        hourly_savings: number;
    }>;
    total_savings_estimate: number;
    message: string;
}

/** Get autopilot status for a home. */
export async function getAutopilotStatus(homeId: string): Promise<AutopilotStatus> {
    return apiFetch<AutopilotStatus>(`/autopilot/status?home_id=${homeId}`);
}

/** List all automation rules for a home. */
export async function getAutopilotRules(homeId: string): Promise<AutopilotRule[]> {
    return apiFetch<AutopilotRule[]>(`/autopilot/rules?home_id=${homeId}`);
}

/** Create a new automation rule. */
export async function createAutopilotRule(rule: {
    home_id: string;
    name: string;
    description?: string;
    condition_type?: string;
    condition_value?: Record<string, any>;
    target_appliance_ids: string[];
    action: string;
}): Promise<AutopilotRule> {
    return apiFetch<AutopilotRule>('/autopilot/rules', {
        method: 'POST',
        body: JSON.stringify(rule),
    });
}

/** Update an automation rule. */
export async function updateAutopilotRule(
    ruleId: string,
    updates: Partial<{
        name: string;
        description: string;
        target_appliance_ids: string[];
        action: string;
        is_active: boolean;
    }>,
): Promise<AutopilotRule> {
    return apiFetch<AutopilotRule>(`/autopilot/rules/${ruleId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
    });
}

/** Delete an automation rule. */
export async function deleteAutopilotRule(ruleId: string): Promise<void> {
    await apiFetch(`/autopilot/rules/${ruleId}`, { method: 'DELETE' });
}

/** Enable or disable autopilot for a home. */
export async function toggleAutopilot(
    homeId: string,
    enabled: boolean,
): Promise<{ success: boolean; enabled: boolean; message: string }> {
    return apiFetch('/autopilot/toggle', {
        method: 'POST',
        body: JSON.stringify({ home_id: homeId, enabled }),
    });
}

/** Simulate what autopilot would do at peak. */
export async function simulateAutopilot(homeId: string): Promise<SimulationResult> {
    return apiFetch<SimulationResult>(`/autopilot/simulate?home_id=${homeId}`, {
        method: 'POST',
    });
}
