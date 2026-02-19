/**
 * API Service Layer
 * 
 * All functions currently return mock data from constants.tsx.
 * When the backend is ready, swap the implementations to use fetchApi().
 * The interface stays the same — screens won't need to change.
 */

import {
    MOCK_APPLIANCES,
    DASHBOARD_STATS,
    CHART_DATA_DONUT,
    CHART_DATA_TRENDS,
    SPARKLINE_DATA,
    ACTIVE_DEVICES_PREVIEW,
    ACHIEVEMENTS,
    CHALLENGES,
    TARIFF_RATES,
    CARBON_STATS,
    CARBON_COMPARISON_DATA,
} from '../constants';

// ── Config ─────────────────────────────────────────────────────────
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

// ── Base Fetch Helper ──────────────────────────────────────────────
interface FetchOptions extends RequestInit {
    params?: Record<string, string>;
}

export async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { params, ...fetchOptions } = options;

    let url = `${API_BASE_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams(params);
        url += `?${searchParams.toString()}`;
    }

    const defaultHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    // TODO: Add auth token from AuthContext
    // const token = getAuthToken();
    // if (token) defaultHeaders['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
        ...fetchOptions,
        headers: {
            ...defaultHeaders,
            ...fetchOptions.headers,
        },
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API Error ${response.status}: ${errorBody}`);
    }

    return response.json();
}

// ── Dashboard ──────────────────────────────────────────────────────

export async function getDashboardStats() {
    // TODO: return fetchApi('/dashboard/stats');
    return DASHBOARD_STATS;
}

export async function getAppliances() {
    // TODO: return fetchApi<Appliance[]>('/appliances');
    return MOCK_APPLIANCES;
}

// ── Insights ───────────────────────────────────────────────────────

export async function getConsumptionBreakdown() {
    // TODO: return fetchApi('/insights/consumption');
    return CHART_DATA_DONUT;
}

export async function getDailyTrends() {
    // TODO: return fetchApi('/insights/trends');
    return CHART_DATA_TRENDS;
}

export async function getSparklineData() {
    // TODO: return fetchApi('/insights/sparkline');
    return SPARKLINE_DATA;
}

export async function getActiveDevicesPreview() {
    // TODO: return fetchApi('/insights/active-devices');
    return ACTIVE_DEVICES_PREVIEW;
}

// ── Rewards & Gamification ─────────────────────────────────────────

export async function getAchievements() {
    // TODO: return fetchApi('/rewards/achievements');
    return ACHIEVEMENTS;
}

export async function getChallenges() {
    // TODO: return fetchApi('/rewards/challenges');
    return CHALLENGES;
}

export async function getCarbonStats() {
    // TODO: return fetchApi('/rewards/carbon');
    return CARBON_STATS;
}

export async function getCarbonComparison() {
    // TODO: return fetchApi('/rewards/carbon-comparison');
    return CARBON_COMPARISON_DATA;
}

// ── Tariff ─────────────────────────────────────────────────────────

export async function getTariffRates() {
    // TODO: return fetchApi('/tariff/rates');
    return TARIFF_RATES;
}

// ── Appliance Control ──────────────────────────────────────────────

export async function toggleAppliance(applianceId: string, state: boolean) {
    // TODO: return fetchApi(`/appliances/${applianceId}/toggle`, { method: 'POST', body: JSON.stringify({ state }) });
    console.log(`[Mock] Toggle appliance ${applianceId} to ${state ? 'ON' : 'OFF'}`);
    return { success: true };
}

export async function scheduleAppliance(applianceId: string, time: string) {
    // TODO: return fetchApi(`/appliances/${applianceId}/schedule`, { method: 'POST', body: JSON.stringify({ time }) });
    console.log(`[Mock] Schedule appliance ${applianceId} at ${time}`);
    return { success: true };
}

// ── Notifications ──────────────────────────────────────────────────

export async function getNotifications() {
    // TODO: return fetchApi('/notifications');
    // Returns inline mock data for now (imported directly by Notifications screen)
    return [];
}

export async function markNotificationRead(notificationId: number) {
    // TODO: return fetchApi(`/notifications/${notificationId}/read`, { method: 'PATCH' });
    console.log(`[Mock] Mark notification ${notificationId} as read`);
    return { success: true };
}

// ── Bills ──────────────────────────────────────────────────────────

export async function getBillHistory(year: number) {
    // TODO: return fetchApi(`/bills?year=${year}`);
    console.log(`[Mock] Get bills for year ${year}`);
    return [];
}

// ── User / Profile ─────────────────────────────────────────────────

export async function getUserProfile() {
    // TODO: return fetchApi('/user/profile');
    return {
        name: 'Rohit Sharma',
        location: 'Bangalore, KA',
        kwhSaved: 1284,
        treesPlanted: 145,
    };
}

export async function updateUserProfile(data: Record<string, unknown>) {
    // TODO: return fetchApi('/user/profile', { method: 'PUT', body: JSON.stringify(data) });
    console.log('[Mock] Update profile:', data);
    return { success: true };
}
