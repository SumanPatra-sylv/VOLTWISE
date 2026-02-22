/**
 * API Service Layer
 *
 * Dashboard stats are fetched via one Supabase RPC call (get_dashboard_stats)
 * to avoid N+1 queries. The RPC handles ToD tariff via tariff_slots,
 * balance, recharge date, and usage aggregates — all in a single round-trip.
 *
 * Non-dashboard functions still return mock data from constants.tsx.
 * Swap them to real queries as each screen is integrated.
 */

import { supabase } from './supabase';
import {
    MOCK_APPLIANCES,
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

// ── Types ──────────────────────────────────────────────────────────

/** Shape returned by the get_dashboard_stats RPC function */
export interface DashboardStats {
    balance: number;
    lastRechargeAmount: number;
    lastRechargeDate: string;        // formatted "DD Month, YYYY"
    balancePercent: number;
    dailyAvgUsage: number;
    currentTariff: number;           // rate from latest meter reading
    yearAverage: number;
    currentLoad: number;             // kW
    todayCost: number;
    todayKwh: number;
    monthBill: number;
    monthSavings: number;
    activeDevices: number;
    // ToD slot info
    currentSlotType: 'off-peak' | 'normal' | 'peak';
    currentSlotRate: number;
    nextSlotChange: string;          // e.g. "18:00"
    nextSlotType: 'off-peak' | 'normal' | 'peak';
    nextSlotRate: number;
}

/** Fallback stats when RPC returns null or no data exists yet */
const EMPTY_STATS: DashboardStats = {
    balance: 0,
    lastRechargeAmount: 0,
    lastRechargeDate: '—',
    balancePercent: 0,
    dailyAvgUsage: 0,
    currentTariff: 0,
    yearAverage: 0,
    currentLoad: 0,
    todayCost: 0,
    todayKwh: 0,
    monthBill: 0,
    monthSavings: 0,
    activeDevices: 0,
    currentSlotType: 'normal',
    currentSlotRate: 0,
    nextSlotChange: '—',
    nextSlotType: 'normal',
    nextSlotRate: 0,
};

// ── Dashboard ──────────────────────────────────────────────────────

export async function getDashboardStats(homeId: string): Promise<DashboardStats> {
    if (!homeId) return EMPTY_STATS;

    const { data, error } = await supabase.rpc('get_dashboard_stats', { p_home_id: homeId });

    if (error) {
        console.error('[API] get_dashboard_stats RPC error:', error.message);
        return EMPTY_STATS;
    }

    // RPC returns JSON — merge with defaults to fill any missing fields
    return { ...EMPTY_STATS, ...(data as DashboardStats) };
}

export async function getAppliances() {
    // TODO: return fetchApi<Appliance[]>('/appliances');
    return MOCK_APPLIANCES;
}

// ── Insights ───────────────────────────────────────────────────────

export async function getConsumptionBreakdown() {
    return CHART_DATA_DONUT;
}

export async function getDailyTrends() {
    return CHART_DATA_TRENDS;
}

export async function getSparklineData() {
    return SPARKLINE_DATA;
}

export async function getActiveDevicesPreview() {
    return ACTIVE_DEVICES_PREVIEW;
}

// ── Rewards & Gamification ─────────────────────────────────────────

export async function getAchievements() {
    return ACHIEVEMENTS;
}

export async function getChallenges() {
    return CHALLENGES;
}

export async function getCarbonStats() {
    return CARBON_STATS;
}

export async function getCarbonComparison() {
    return CARBON_COMPARISON_DATA;
}

// ── Tariff ─────────────────────────────────────────────────────────

export async function getTariffRates() {
    return TARIFF_RATES;
}

// ── Appliance Control ──────────────────────────────────────────────

export async function toggleAppliance(applianceId: string, state: boolean) {
    console.log(`[Mock] Toggle appliance ${applianceId} to ${state ? 'ON' : 'OFF'}`);
    return { success: true };
}

export async function scheduleAppliance(applianceId: string, time: string) {
    console.log(`[Mock] Schedule appliance ${applianceId} at ${time}`);
    return { success: true };
}

// ── Notifications ──────────────────────────────────────────────────

export async function getNotifications() {
    return [];
}

export async function markNotificationRead(notificationId: number) {
    console.log(`[Mock] Mark notification ${notificationId} as read`);
    return { success: true };
}

// ── Bills ──────────────────────────────────────────────────────────

export async function getBillHistory(year: number) {
    console.log(`[Mock] Get bills for year ${year}`);
    return [];
}
