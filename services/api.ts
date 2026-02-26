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

// ── Emission & Tariff Constants ────────────────────────────────────
// Emission factors by ToD slot type (India grid — fossil mix varies by time)
const EMISSION_FACTORS = {
    peak: 0.90,       // kg CO₂/kWh during peak (more thermal plants online)
    normal: 0.82,     // kg CO₂/kWh during normal hours
    offPeak: 0.75,    // kg CO₂/kWh during off-peak (higher renewables share)
    blended: 0.85,    // India grid average
};

// SBPDCL tariff rates (from seed: 04_seed_tariffs.sql)
const SBPDCL_RATES = {
    peak: 9.55,       // ₹/kWh (highest_slab_rate × 1.20)
    normal: 7.42,     // ₹/kWh (lowest_slab_rate × 1.00)
    offPeak: 6.31,    // ₹/kWh (lowest_slab_rate × 0.85)
};

// ── Carbon Dashboard (Comprehensive) ──────────────────────────────

export interface CarbonDashboardData {
    totalEmittedKg: number;           // SUM(carbon_kg) this month from daily_aggregates (DB)
    monthlyKwh: number;               // SUM(total_kwh) this month from daily_aggregates (DB)
    monthChangePercent: number;       // (thisMonth - lastMonth) / lastMonth * 100 (DB)
    perCapitaKg: number;              // totalEmittedKg / household_members (DB)
    householdMembers: number;         // from homes table (DB)
    co2ReducedViaShiftKg: number;     // calculated from monthSavings (DB)
    kwhShifted: number;               // monthSavings / rate_diff (DB)
    withoutOptimizationKg: number;    // kwhShifted × peak emission factor
    withOptimizationKg: number;       // kwhShifted × off-peak emission factor
    co2AvoidedKg: number;             // difference
    monthSavings: number;             // from DB (get_dashboard_stats RPC)
    trendData: { date: string; carbonKg: number; kwh: number }[];  // daily data from daily_aggregates (DB)
}

export async function getCarbonDashboard(homeId: string): Promise<CarbonDashboardData | null> {
    if (!homeId) return null;

    try {
        const stats = await getDashboardStats(homeId);
        if (!stats) return null;

        // Fetch household_members from homes table
        let householdMembers = 4;
        try {
            const { data: homeData } = await supabase
                .from('homes')
                .select('household_members')
                .eq('id', homeId)
                .single();
            if (homeData?.household_members) {
                householdMembers = homeData.household_members;
            }
        } catch { /* use default */ }

        // ── Fetch REAL daily data from daily_aggregates (last 30 days) ──
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        const { data: dailyRows } = await supabase
            .from('daily_aggregates')
            .select('date, total_kwh, carbon_kg')
            .eq('home_id', homeId)
            .is('appliance_id', null)         // whole-home aggregates only
            .gte('date', thirtyDaysAgoStr)
            .order('date', { ascending: true });

        // Build trend data from real DB rows
        const trendData = (dailyRows || []).map(row => ({
            date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            carbonKg: Math.round(Number(row.carbon_kg || 0) * 100) / 100,
            kwh: Math.round(Number(row.total_kwh || 0) * 100) / 100,
        }));

        // ── This month's totals from REAL DB data ──
        const firstOfMonth = new Date();
        firstOfMonth.setDate(1);
        const firstOfMonthStr = firstOfMonth.toISOString().split('T')[0];

        const thisMonthRows = (dailyRows || []).filter(r => r.date >= firstOfMonthStr);
        const monthlyKwh = thisMonthRows.reduce((sum, r) => sum + Number(r.total_kwh || 0), 0);
        const totalEmittedKg = Math.round(
            thisMonthRows.reduce((sum, r) => sum + Number(r.carbon_kg || 0), 0)
        );

        // ── Last month's total for comparison ──
        const lastMonthStart = new Date(firstOfMonth);
        lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
        const lastMonthEnd = new Date(firstOfMonth);
        lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);

        const { data: lastMonthRows } = await supabase
            .from('daily_aggregates')
            .select('carbon_kg')
            .eq('home_id', homeId)
            .is('appliance_id', null)
            .gte('date', lastMonthStart.toISOString().split('T')[0])
            .lte('date', lastMonthEnd.toISOString().split('T')[0]);

        const lastMonthTotal = (lastMonthRows || []).reduce((sum, r) => sum + Number(r.carbon_kg || 0), 0);
        const monthChangePercent = lastMonthTotal > 0
            ? Math.round(((totalEmittedKg - lastMonthTotal) / lastMonthTotal) * 100 * 10) / 10
            : 0;

        const perCapitaKg = Math.round((totalEmittedKg / householdMembers) * 10) / 10;

        // Optimization comparison (from monthSavings ₹ — real DB value)
        const monthSavings = stats.monthSavings || 0;
        const rateDiff = SBPDCL_RATES.peak - SBPDCL_RATES.offPeak; // 3.24 ₹/kWh
        const kwhShifted = rateDiff > 0 ? Math.round((monthSavings / rateDiff) * 10) / 10 : 0;
        const withoutOptimizationKg = Math.round(kwhShifted * EMISSION_FACTORS.peak * 100) / 100;
        const withOptimizationKg = Math.round(kwhShifted * EMISSION_FACTORS.offPeak * 100) / 100;
        const co2AvoidedKg = Math.round((withoutOptimizationKg - withOptimizationKg) * 100) / 100;

        return {
            totalEmittedKg, monthlyKwh: Math.round(monthlyKwh), monthChangePercent,
            perCapitaKg, householdMembers, co2ReducedViaShiftKg: co2AvoidedKg,
            kwhShifted, withoutOptimizationKg, withOptimizationKg, co2AvoidedKg,
            monthSavings, trendData,
        };
    } catch (error) {
        console.error('[API] getCarbonDashboard error:', error);
        return null;
    }
}

// ── Legacy carbon functions (kept for compatibility) ───────────────

export async function getCarbonStatsRealData(homeId: string): Promise<CarbonStatsData | null> {
    if (!homeId) return null;
    try {
        const stats = await getDashboardStats(homeId);
        if (!stats) return null;
        const userConsumption = Math.max(1, stats.dailyAvgUsage * 30);
        const co2Avoided = (REGIONAL_AVERAGE_KWH - userConsumption) * CARBON_EMISSION_FACTOR;
        const treesSavedPerMonth = Math.abs(co2Avoided) / CO2_PER_TREE_PER_MONTH;
        return {
            user: Math.round(userConsumption),
            neighbors: 180,
            national: REGIONAL_AVERAGE_KWH,
            trees: Math.max(0, Math.floor(treesSavedPerMonth / 12)),
            co2Saved: Math.max(0, Math.round(co2Avoided)),
        };
    } catch { return null; }
}

export async function getCarbonImpactData(homeId: string): Promise<CarbonImpactData | null> {
    if (!homeId) return null;
    try {
        const dashboard = await getCarbonDashboard(homeId);
        if (!dashboard) return null;
        return {
            last_month_change: dashboard.monthChangePercent,
            tariff_reduced_kg: dashboard.co2ReducedViaShiftKg,
            household_members: dashboard.householdMembers,
            current_xp: 70,
        };
    } catch { return null; }
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
