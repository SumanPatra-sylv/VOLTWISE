/**
 * Admin API Service — calls FastAPI admin endpoints + Supabase RPCs.
 */
import { supabase } from './supabase';

const API_BASE = '/api';

async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token ?? '';
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

async function apiFetch<T>(path: string): Promise<T> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail || `API error ${res.status}`);
    }
    return res.json();
}

async function apiPost<T>(path: string, body: any): Promise<T> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
        const b = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(b.detail || `API error ${res.status}`);
    }
    return res.json();
}

async function apiPatch<T>(path: string): Promise<T> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}${path}`, { method: 'PATCH', headers });
    if (!res.ok) {
        const b = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(b.detail || `API error ${res.status}`);
    }
    return res.json();
}

// ── Types ─────────────────────────────────────────────────────────

export interface DashboardStats {
    total_consumers: number;
    total_app_users: number;
    active_meters: number;
    offline_meters: number;
    stale_meters: number;
    total_linked_appliances: number;
    today_revenue: number;
    monthly_revenue: number;
    active_rechargers_7d: number;
    critical_balance_users: number;
    low_balance_users: number;
    avg_balance: number;
    peak_load_today: number;
    current_tariff_slot: string;
    pending_complaints: number;
    avg_resolution_hours: number;
    total_savings: number;
    co2_saved_this_month: number;
    non_recharging_30d: number;
    non_recharging_45d: number;
}

export interface ConsumerRow {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    consumer_number: string | null;
    role: string;
    onboarding_done: boolean;
    created_at: string;
    home_name: string | null;
    meter_number: string | null;
    balance: number | null;
    total_recharges: number;
    total_recharge_amount: number;
    area?: string;
}

export interface RiskFlag {
    type: string;
    severity: 'critical' | 'high' | 'medium';
    label: string;
    value?: number;
    days?: number;
    hours?: number;
    ratio?: number;
}

export interface RiskScore {
    risk_score: number;
    flags: RiskFlag[];
    user_id: string;
}

export interface ConsumerProfile {
    profile: any;
    home: any;
    meter: any;
    tariff: any;
    appliances: any[];
    recharge_stats: any;
    recent_recharges: any[];
    open_complaints: any[];
    usage_30d: any[];
    monthly_usage: any[];
}

export interface MeterHealthStats {
    total_meters: number;
    active_meters: number;
    offline_meters: number;
    stale_meters: number;
    online_meters: number;
    avg_balance: number;
    manufacturer_distribution: any[];
    installation_timeline: any[];
    offline_meter_details: any[];
}

// ── API Methods ───────────────────────────────────────────────────

export async function fetchDashboardStats(): Promise<DashboardStats> {
    // Try FastAPI first, fallback to direct RPC
    try {
        return await apiFetch<DashboardStats>('/admin/dashboard');
    } catch {
        const { data } = await supabase.rpc('get_admin_dashboard_stats');
        return data as DashboardStats;
    }
}

export async function fetchConsumers(): Promise<ConsumerRow[]> {
    try {
        const result = await apiFetch<{ total: number; consumers: ConsumerRow[] }>('/admin/consumers');
        return result.consumers;
    } catch {
        const { data } = await supabase.rpc('get_admin_users');
        return (data || []) as ConsumerRow[];
    }
}

export async function fetchConsumerProfile(userId: string): Promise<ConsumerProfile> {
    try {
        return await apiFetch<ConsumerProfile>(`/admin/consumers/${userId}`);
    } catch {
        const { data } = await supabase.rpc('get_consumer_profile', { p_user_id: userId });
        return data as ConsumerProfile;
    }
}

export async function fetchRiskScore(userId: string): Promise<RiskScore> {
    return apiFetch<RiskScore>(`/admin/consumers/${userId}/risk-score`);
}

export async function fetchMeterHealth(): Promise<MeterHealthStats> {
    try {
        return await apiFetch<MeterHealthStats>('/admin/reports/meter-health');
    } catch {
        const { data } = await supabase.rpc('get_meter_health_stats');
        return data as MeterHealthStats;
    }
}

export async function fetchRevenueStats(period = 'month', date?: string): Promise<any> {
    try {
        const params = date ? `?period=${period}&date=${date}` : `?period=${period}`;
        return await apiFetch(`/admin/reports/revenue${params}`);
    } catch {
        const { data } = await supabase.rpc('get_revenue_stats', { p_period: period });
        return data;
    }
}

export async function fetchComplaintStats(period = 'month'): Promise<any> {
    try {
        return await apiFetch(`/admin/reports/complaints?period=${period}`);
    } catch {
        const { data } = await supabase.rpc('get_complaint_stats', { p_period: period });
        return data;
    }
}

export async function fetchConsumptionReport(): Promise<any> {
    return apiFetch('/admin/reports/consumption');
}

export async function fetchOptimizationReport(): Promise<any> {
    return apiFetch('/admin/reports/optimization');
}

export async function fetchApplianceReport(): Promise<any> {
    return apiFetch('/admin/reports/appliances');
}

export async function fetchAdoptionReport(): Promise<any> {
    return apiFetch('/admin/reports/adoption');
}

export async function fetchAuditLogs(limit = 50, offset = 0): Promise<any> {
    return apiFetch(`/admin/audit-logs?limit=${limit}&offset=${offset}`);
}

export async function fetchDiscoms(): Promise<any> {
    return apiFetch('/admin/discoms');
}

export async function fetchOutages(activeOnly = true): Promise<any> {
    return apiFetch(`/admin/outages?active_only=${activeOnly}`);
}

export async function createOutage(body: {
    area: string; feeder_id?: string; reason: string;
    start_time: string; estimated_end: string;
}): Promise<any> {
    return apiPost('/admin/outages', body);
}

export async function resolveOutage(outageId: string): Promise<any> {
    return apiPatch(`/admin/outages/${outageId}/resolve`);
}

// ── Complaint Management ────────────────────────────────────────

export async function fetchComplaintList(params?: {
    status?: string; type?: string; limit?: number; offset?: number;
}): Promise<any> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    return apiFetch(`/admin/complaints?${qs.toString()}`);
}

export async function fetchComplaintDetail(complaintId: string): Promise<any> {
    return apiFetch(`/admin/complaints/${complaintId}`);
}

export async function updateComplaintStatus(complaintId: string, body: {
    status: string; note?: string; assigned_to?: string; resolution_note?: string;
}): Promise<any> {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/admin/complaints/${complaintId}/status`, {
        method: 'PATCH', headers, body: JSON.stringify(body),
    });
    if (!res.ok) {
        const b = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(b.detail || `API error ${res.status}`);
    }
    return res.json();
}

export async function addComplaintNote(complaintId: string, note: string): Promise<any> {
    return apiPost(`/admin/complaints/${complaintId}/notes`, { note });
}

// ── Impersonation ────────────────────────────────────────────────

export async function impersonateConsumer(userId: string): Promise<{
    magic_link: string; consumer_name: string; consumer_email: string;
}> {
    return apiPost(`/admin/consumers/${userId}/impersonate`, {});
}
