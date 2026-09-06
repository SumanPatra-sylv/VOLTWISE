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
 * Cancel/delete a schedule — removes APScheduler jobs and deactivates DB record.
 */
export async function deleteSchedule(
    applianceId: string,
    scheduleId: string,
): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/appliances/${applianceId}/schedule/${scheduleId}`, {
        method: 'DELETE',
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
    strategy: string;
    grid_protection_enabled: boolean;
    rules_count: number;
    active_rules: number;
    triggered_rules: number;
    delegated_devices: number;
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

// ── Autopilot V2 API ──────────────────────────────────────────────

export type AutopilotStrategy = 'balanced' | 'max_savings' | 'eco_mode';

export interface PenaltyTimelineEntry {
    hour: number;
    penalty: number;
    cost_component: number;
    carbon_component: number;
    label: string;
    above_threshold: boolean;
}

export interface CarbonStatus {
    region_code: string;
    current_gco2: number;
    status: string;       // "clean" | "moderate" | "dirty"
    is_clean_window: boolean;
    cleanest_hours: number[];
    daily_avg: number;
}

export interface DeviceAutopilotConfig {
    id: string;
    home_id: string;
    appliance_id: string;
    is_delegated: boolean;
    preferred_action: string;
    protected_window_start: string | null;
    protected_window_end: string | null;
    user_override_active: boolean;
    last_override_at: string | null;
    appliances?: {
        name: string;
        category: string;
        status: string;
        rated_power_w: number;
    };
}

export interface GridStatus {
    grid_protection_enabled: boolean;
    status: string;
    frequency_hz?: number;
    voltage_v?: number;
    active_events: any[];
    message?: string;
}

/** Set the autopilot strategy (balanced / max_savings / eco_mode). */
export async function setAutopilotStrategy(
    homeId: string,
    strategy: AutopilotStrategy,
): Promise<{ success: boolean; strategy: string }> {
    return apiFetch('/autopilot/strategy', {
        method: 'PUT',
        body: JSON.stringify({ home_id: homeId, strategy }),
    });
}

/** Toggle grid protection for a home. */
export async function toggleGridProtection(
    homeId: string,
    enabled: boolean,
): Promise<{ success: boolean; enabled: boolean }> {
    return apiFetch('/autopilot/grid-protection', {
        method: 'PUT',
        body: JSON.stringify({ home_id: homeId, enabled }),
    });
}

/** Get 24-hour penalty timeline. */
export async function getPenaltyTimeline(
    homeId: string,
): Promise<{ home_id: string; strategy: string; timeline: PenaltyTimelineEntry[] }> {
    return apiFetch(`/autopilot/penalty-timeline?home_id=${homeId}`);
}

/** Get current carbon intensity status. */
export async function getCarbonStatus(homeId: string): Promise<CarbonStatus> {
    return apiFetch<CarbonStatus>(`/autopilot/carbon-now?home_id=${homeId}`);
}

/** List device autopilot configs for a home. */
export async function getDeviceConfigs(
    homeId: string,
): Promise<{ configs: DeviceAutopilotConfig[] }> {
    return apiFetch(`/autopilot/device-config?home_id=${homeId}`);
}

/** Add or update per-device autopilot config. */
export async function upsertDeviceConfig(config: {
    home_id: string;
    appliance_id: string;
    is_delegated: boolean;
    preferred_action?: string;
    protected_window_start?: string | null;
    protected_window_end?: string | null;
}): Promise<{ success: boolean; config: DeviceAutopilotConfig }> {
    return apiFetch('/autopilot/device-config', {
        method: 'POST',
        body: JSON.stringify(config),
    });
}

/** Record a physical or app-based override. */
export async function recordOverride(
    homeId: string,
    applianceId: string,
    source: 'physical' | 'app' = 'physical',
): Promise<{ success: boolean; message: string }> {
    return apiFetch('/autopilot/override', {
        method: 'POST',
        body: JSON.stringify({
            home_id: homeId,
            appliance_id: applianceId,
            override_source: source,
        }),
    });
}

/** Get grid status for the home's DISCOM. */
export async function getGridStatus(homeId: string): Promise<GridStatus> {
    return apiFetch<GridStatus>(`/autopilot/grid-status?home_id=${homeId}`);
}

// ── Power Analytics API (NILM + Smart Plug) ───────────────────────

export interface PowerApplianceData {
    appliance: string;
    label: string;
    category: string;
    is_on: boolean;
    estimated_watts: number;
    confidence: number;
    source: 'smart_plug' | 'nilm' | 'estimated';
}

export interface PowerSnapshot {
    timestamp: string;
    aggregate_watts: number;
    appliances: PowerApplianceData[];
    total_disaggregated: number;
    untracked_watts: number;
    smart_plug_count: number;
    nilm_count: number;
}

export interface PowerTimelinePoint {
    timestamp: string;
    watts: number;
}

export interface PowerBreakdownItem {
    appliance: string;
    label: string;
    category: string;
    watts: number;
    percentage: number;
    is_on: boolean;
    source: string;
    confidence: number;
}

export interface PowerBreakdown {
    total_watts: number;
    breakdown: PowerBreakdownItem[];
    timestamp: string;
}

export interface PowerSourceInfo {
    appliance: string;
    label: string;
    category: string;
    source: 'smart_plug' | 'nilm';
    accuracy: string;
}

/** Get live power snapshot — aggregate + per-appliance watts. */
export async function getPowerSnapshot(homeId: string): Promise<PowerSnapshot> {
    return apiFetch<PowerSnapshot>(`/power-analytics/snapshot?home_id=${homeId}`);
}

/** Get power timeline for area chart (5-min intervals). */
export async function getPowerTimeline(
    homeId: string,
    hours: number = 24,
): Promise<{ home_id: string; hours: number; data: PowerTimelinePoint[] }> {
    return apiFetch(`/power-analytics/timeline?home_id=${homeId}&hours=${hours}`);
}

/** Get per-appliance breakdown for donut chart. */
export async function getPowerBreakdown(homeId: string): Promise<PowerBreakdown> {
    return apiFetch<PowerBreakdown>(`/power-analytics/breakdown?home_id=${homeId}`);
}

/** Get data source info for each appliance. */
export async function getPowerSources(homeId: string): Promise<{ sources: PowerSourceInfo[]; model_info: any }> {
    return apiFetch(`/power-analytics/sources?home_id=${homeId}`);
}

<<<<<<< HEAD
// ── Billing API ───────────────────────────────────────────────────

export interface BillingMonthEntry {
    month: number;
    month_name: string;
    month_short: string;
    total_kwh: number;
    total_amount: number;
    energy_charge: number;
    status: 'paid' | 'pending' | 'current' | 'future' | 'error';
    due_date: string | null;
}

export interface BillingYearlySummary {
    year: number;
    home_id: string;
    months: BillingMonthEntry[];
    annual_total: number;
    annual_kwh: number;
    avg_monthly: number;
    lowest_month: BillingMonthEntry | null;
    highest_month: BillingMonthEntry | null;
}

export interface SlabBreakdown {
    from_kwh: number;
    to_kwh: number | null;
    rate_per_kwh: number;
    kwh_billed: number;
    cost: number;
}

export interface TodBreakdownEntry {
    kwh: number;
    adjustment: number;
}

export interface DailyAuditEntry {
    date: string;
    kwh: number;
    cost: number;
}

export interface EffectiveRateEntry {
    base_rate: number;
    modifier: number;
    effective: number;
}

export interface BillData {
    // Consumer
    consumer_name: string;
    consumer_number: string;
    consumer_phone: string;
    // DISCOM
    discom_name: string;
    discom_code: string;
    plan_name: string;
    // Meter
    meter_number: string;
    meter_type: string;
    sanctioned_load_kw: number;
    // Bill
    year: number;
    month: number;
    month_name: string;
    total_kwh: number;
    energy_charge: number;
    fixed_charge: number;
    tod_adjustment: number;
    electricity_duty: number;
    fac: number;
    total_amount: number;
    slab_breakdown: SlabBreakdown[];
    tod_breakdown: Record<string, TodBreakdownEntry>;
    daily_audit: DailyAuditEntry[];
    data_source: 'interval_readings' | 'daily_aggregates';
    interval_count: number;
    // Rates
    effective_rates: Record<string, EffectiveRateEntry>;
    slabs: Array<{ from_kwh: number; to_kwh: number | null; rate_per_kwh: number }>;
}

export interface EffectiveRates {
    plan_name: string;
    discom_name: string;
    discom_code: string;
    slabs: Array<{ from_kwh: number; to_kwh: number | null; rate_per_kwh: number }>;
    effective_rates: Record<string, EffectiveRateEntry>;
    fixed_charge_per_kw: number;
    sanctioned_load_kw: number;
}

/** Get 12-month billing summary for a year. */
export async function getBillingMonthlySummary(
    homeId: string,
    year: number,
): Promise<BillingYearlySummary> {
    return apiFetch<BillingYearlySummary>(
        `/billing/monthly-summary?home_id=${homeId}&year=${year}`,
    );
}

/** Get full bill data for a single month (PDF-ready). */
export async function getBillingBillData(
    homeId: string,
    year: number,
    month: number,
): Promise<BillData> {
    return apiFetch<BillData>(
        `/billing/bill-data?home_id=${homeId}&year=${year}&month=${month}`,
    );
}

/** Get current effective rates (slab + ToD). */
export async function getBillingEffectiveRates(
    homeId: string,
): Promise<EffectiveRates> {
    return apiFetch<EffectiveRates>(
        `/billing/effective-rates?home_id=${homeId}`,
    );
}
=======
// ── Smart Plug API ────────────────────────────────────────────────

export interface PlugStatusData {
    plug_id: string;
    tuya_device_id: string;
    is_online: boolean;
    is_on: boolean;
    power_w: number;
    voltage: number;
    current_ma: number;
    energy_kwh: number;
    source: string;
    last_seen_at: string | null;
}

export interface PlugReadingsData {
    plug_id: string;
    period: string;
    count: number;
    readings: Array<{
        timestamp: string;
        power_w: number;
        voltage: number;
        current_ma: number;
        energy_kwh: number;
        is_on: boolean;
    }>;
    summary: {
        avg_power_w: number;
        max_power_w: number;
        min_power_w: number;
        total_energy_kwh: number;
        reading_count: number;
        uptime_percent: number;
    };
}

export interface PlugSummaryData {
    id: string;
    tuya_device_id: string;
    name: string | null;
    plug_status: string;
    device_type: string | null;
    last_power_w: number | null;
    last_voltage: number | null;
    last_seen_at: string | null;
    linked_appliance: string | null;
}

export interface RegisterPlugData {
    plug_id: string;
    tuya_device_id: string;
    name: string;
    status: string;
    message: string;
}

/** Register a new smart plug (Wipro 16A / Tuya). */
export async function registerPlug(params: {
    home_id: string;
    tuya_device_id: string;
    name?: string;
    local_key?: string;
    ip_address?: string;
    device_type?: string;
}): Promise<RegisterPlugData> {
    return apiFetch<RegisterPlugData>('/plugs/register', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/** Get live power status from a smart plug. */
export async function getPlugStatus(plugId: string): Promise<PlugStatusData> {
    return apiFetch<PlugStatusData>(`/plugs/${plugId}/status`);
}

/** Get historical readings for a plug. */
export async function getPlugReadings(
    plugId: string,
    period: '1h' | '6h' | '24h' | '7d' | '30d' = '24h',
): Promise<PlugReadingsData> {
    return apiFetch<PlugReadingsData>(`/plugs/${plugId}/readings?period=${period}`);
}

/** Link a smart plug to an appliance. */
export async function linkPlug(
    plugId: string,
    applianceId: string,
): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/plugs/${plugId}/link`, {
        method: 'POST',
        body: JSON.stringify({ appliance_id: applianceId }),
    });
}

/** Turn a smart plug on or off directly. */
export async function controlPlug(
    plugId: string,
    action: 'turn_on' | 'turn_off',
): Promise<{ success: boolean; action: string; source: string; response_time_ms: number; message: string }> {
    return apiFetch(`/plugs/${plugId}/control`, {
        method: 'POST',
        body: JSON.stringify({ action }),
    });
}

/** List all smart plugs for a home. */
export async function listPlugs(homeId: string): Promise<PlugSummaryData[]> {
    return apiFetch<PlugSummaryData[]>(`/plugs?home_id=${homeId}`);
}

/** Unregister a smart plug. */
export async function unregisterPlug(plugId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch(`/plugs/${plugId}`, { method: 'DELETE' });
}

>>>>>>> 79c5f54edac01d3623b65df8fcd602cf694f9d25
