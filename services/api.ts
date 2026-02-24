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

// ── Carbon Stats (Real Data from Dashboard) ────────────────────────

export interface CarbonStatsData {
    user: number;
    neighbors: number;
    national: number;
    trees: number;
    co2Saved: number;
}

export interface CarbonImpactData {
    last_month_change: number;
    tariff_reduced_kg: number;
    household_members: number;
    current_xp: number;
}

const REGIONAL_AVERAGE_KWH = 250;
const CARBON_EMISSION_FACTOR = 0.85; // kg CO2 per kWh (Indian grid)
const CO2_PER_TREE_PER_MONTH = 1.75; // kg CO2

export async function getCarbonStatsRealData(homeId: string): Promise<CarbonStatsData | null> {
    if (!homeId) {
        console.warn('[API] getCarbonStatsRealData: no homeId provided');
        return null;
    }

    try {
        console.log('[API] getCarbonStatsRealData: START fetching for homeId:', homeId);
        
        // Get dashboard stats which includes monthlyUsage (currentMonthKwh)
        let dashboardStats;
        try {
            dashboardStats = await getDashboardStats(homeId);
            console.log('[API] getDashboardStats returned:', dashboardStats);
        } catch (statsError) {
            console.error('[API] Error calling getDashboardStats:', statsError);
            // Use fallback values if RPC fails
            dashboardStats = {
                dailyAvgUsage: 5.4, // ~162 kWh/month (250/30 * 0.6 = reasonable estimate)
                monthBill: 0,
                balance: 0,
                lastRechargeAmount: 0,
                lastRechargeDate: '',
                balancePercent: 0,
                currentTariff: 0,
                yearAverage: 0,
                currentLoad: 0,
                todayCost: 0,
                todayKwh: 0,
                monthSavings: 0,
                activeDevices: 0,
                currentSlotType: 'normal' as const,
                currentSlotRate: 0,
                nextSlotChange: '',
                nextSlotType: 'normal' as const,
                nextSlotRate: 0,
            };
            console.warn('[API] Using fallback dashboard stats');
        }
        
        if (!dashboardStats) {
            console.warn('[API] getCarbonStatsRealData: dashboardStats is null');
            return null;
        }

        // Calculate user's current month consumption
        const userConsumption = Math.max(1, dashboardStats.dailyAvgUsage * 30); // monthly estimate, min 1 kWh
        
        console.log('[API] userConsumption calculated:', userConsumption);
        
        // Regional averages (can be fetched from DB or use defaults)
        const neighborAverage = 180; 
        const nationalAverage = REGIONAL_AVERAGE_KWH;

        // Calculate CO2 avoided (difference from regional average)
        const co2Avoided = (nationalAverage - userConsumption) * CARBON_EMISSION_FACTOR;
        
        // Calculate trees saved (per year)
        // Monthly trees = CO2 Avoided / 1.75
        // Yearly trees = (CO2 Avoided / 1.75) / 12
        const treesSavedPerMonth = Math.abs(co2Avoided) / CO2_PER_TREE_PER_MONTH;
        const treesSavedPerYear = Math.floor(treesSavedPerMonth / 12);

        const result = {
            user: Math.round(userConsumption),
            neighbors: neighborAverage,
            national: nationalAverage,
            trees: Math.max(0, treesSavedPerYear),
            co2Saved: Math.max(0, Math.round(co2Avoided))
        };

        console.log('[API] getCarbonStatsRealData: FINAL RESULT:', result);
        return result;
    } catch (error) {
        console.error('[API] getCarbonStatsRealData CATCH error:', error);
        return null;
    }
}

// ── Carbon Impact (Real Data) ──────────────────────────────────────

export async function getCarbonImpactData(homeId: string): Promise<CarbonImpactData | null> {
    if (!homeId) {
        console.warn('[API] getCarbonImpactData: no homeId provided');
        return null;
    }

    try {
        console.log('[API] getCarbonImpactData: fetching for homeId:', homeId);
        
        // TODO: Replace with actual API call when backend is ready
        // For now, return mock data with realistic values
        const carbonImpactData: CarbonImpactData = {
            last_month_change: -8, // 8% lower
            tariff_reduced_kg: 12,
            household_members: 4,
            current_xp: 70 // 0-100 scale for level progress
        };

        console.log('[API] getCarbonImpactData result:', carbonImpactData);
        return carbonImpactData;
    } catch (error) {
        console.error('[API] getCarbonImpactData error:', error);
        return null;
    }
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
