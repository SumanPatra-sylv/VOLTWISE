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
const CO2_PER_TREE_PER_MONTH = 1.75; // kg CO2

// ── Emission & Tariff Constants (fallbacks — real data from carbon_intensity_schedule) ──
const EMISSION_FACTORS_FALLBACK = {
    peak: 0.90,       // kg CO₂/kWh during peak (more thermal plants online)
    offPeak: 0.75,    // kg CO₂/kWh during off-peak (higher renewables share)
    blended: 0.82,    // India grid average
};

// ── Carbon Dashboard (Comprehensive) ──────────────────────────────

export interface CarbonDashboardData {
    totalEmittedKg: number;           // SUM(carbon_kg) this month from daily_aggregates (DB)
    monthlyKwh: number;               // SUM(total_kwh) this month from daily_aggregates (DB)
    monthChangePercent: number;       // (thisMonth - lastMonth) / lastMonth * 100 (DB)
    perCapitaKg: number;              // totalEmittedKg / household_members (DB)
    householdMembers: number;         // from homes table (DB)
    co2ReducedViaShiftKg: number;     // calculated from autopilot/optimization actions
    kwhShifted: number;               // kWh shifted from peak to off-peak
    withoutOptimizationKg: number;    // kwhShifted × peak carbon intensity
    withOptimizationKg: number;       // kwhShifted × off-peak carbon intensity
    co2AvoidedKg: number;             // difference
    monthSavings: number;             // from DB (get_dashboard_stats RPC)
    peakCarbonIntensity: number;      // gCO₂/kWh from carbon_intensity_schedule
    offPeakCarbonIntensity: number;   // gCO₂/kWh from carbon_intensity_schedule
    treesEquivalent: number;          // CO₂ saved → tree equivalents
    neighborhoodAvgKg: number;        // estimated neighborhood average
    trendData: { date: string; carbonKg: number; kwh: number }[];
}

/**
 * Fetch real carbon intensity data from the carbon_intensity_schedule table.
 * Returns average peak and off-peak intensities in gCO₂/kWh for the home's region.
 */
async function fetchCarbonIntensities(homeId: string): Promise<{ peakAvg: number; offPeakAvg: number; dailyAvg: number }> {
    try {
        // Get home's DISCOM → region
        const { data: homeData } = await supabase
            .from('homes')
            .select('discom_id, discoms(state_code)')
            .eq('id', homeId)
            .single();

        const stateCode = (homeData as any)?.discoms?.state_code || 'BR';
        const regionMap: Record<string, string> = { BR: 'IN-BR', GJ: 'IN-GJ' };
        const regionCode = regionMap[stateCode] || 'IN-BR';

        // Fetch all 24h carbon intensity entries
        const { data: carbonRows } = await supabase
            .from('carbon_intensity_schedule')
            .select('hour, gco2_per_kwh')
            .eq('region_code', regionCode)
            .order('hour', { ascending: true });

        if (!carbonRows || carbonRows.length === 0) {
            return {
                peakAvg: EMISSION_FACTORS_FALLBACK.peak * 1000,
                offPeakAvg: EMISSION_FACTORS_FALLBACK.offPeak * 1000,
                dailyAvg: EMISSION_FACTORS_FALLBACK.blended * 1000,
            };
        }

        // Peak hours: 17-22 (5 PM to 10 PM), Off-peak: 0-6 (12 AM to 6 AM)
        const peakHours = [17, 18, 19, 20, 21, 22];
        const offPeakHours = [0, 1, 2, 3, 4, 5, 6];

        const peakEntries = carbonRows.filter(r => peakHours.includes(r.hour));
        const offPeakEntries = carbonRows.filter(r => offPeakHours.includes(r.hour));

        const avg = (arr: typeof carbonRows) => arr.length > 0 ? arr.reduce((s, r) => s + r.gco2_per_kwh, 0) / arr.length : 0;

        return {
            peakAvg: Math.round(avg(peakEntries)),
            offPeakAvg: Math.round(avg(offPeakEntries)),
            dailyAvg: Math.round(avg(carbonRows)),
        };
    } catch {
        return {
            peakAvg: EMISSION_FACTORS_FALLBACK.peak * 1000,
            offPeakAvg: EMISSION_FACTORS_FALLBACK.offPeak * 1000,
            dailyAvg: EMISSION_FACTORS_FALLBACK.blended * 1000,
        };
    }
}

export async function getCarbonDashboard(homeId: string): Promise<CarbonDashboardData | null> {
    if (!homeId) return null;

    try {
        const stats = await getDashboardStats(homeId);
        if (!stats) return null;

        // Fetch household_members from profiles (via homes.user_id → profiles.id)
        // Also fetch tariff_plan_id for savings calculation
        let householdMembers = 4;
        let tariffPlanId: string | null = null;
        try {
            const { data: homeData } = await supabase
                .from('homes')
                .select('user_id, tariff_plan_id')
                .eq('id', homeId)
                .single();
            if (homeData?.user_id) {
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('household_members')
                    .eq('id', homeData.user_id)
                    .single();
                if (profileData?.household_members) {
                    householdMembers = profileData.household_members;
                }
            }
            if (homeData?.tariff_plan_id) tariffPlanId = homeData.tariff_plan_id;
        } catch { /* use default 4 */ }

        // ── Fetch real carbon intensities from DB ──
        const carbonIntensities = await fetchCarbonIntensities(homeId);
        const peakEmission = carbonIntensities.peakAvg / 1000;     // Convert gCO₂/kWh → kgCO₂/kWh
        const offPeakEmission = carbonIntensities.offPeakAvg / 1000;

        // ── Fetch REAL daily data from daily_aggregates (last 30 days) ──
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        const { data: dailyRows } = await supabase
            .from('daily_aggregates')
            .select('date, total_kwh, carbon_kg')
            .eq('home_id', homeId)
            .is('appliance_id', null)
            .gte('date', thirtyDaysAgoStr)
            .order('date', { ascending: true });

        // Build trend data
        const trendData = (dailyRows || []).map(row => ({
            date: new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            carbonKg: Math.round(Number(row.carbon_kg || 0) * 100) / 100,
            kwh: Math.round(Number(row.total_kwh || 0) * 100) / 100,
        }));

        // ── This month's totals ──
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

        // ── Fetch tariff rates (always needed for savings calc) ──────
        let peakRate = 9.55, offPeakRate = 6.31;
        try {
            const { data: tariffSlots } = await supabase
                .from('tariff_slots')
                .select('slot_type, rate')
                .eq('plan_id', tariffPlanId ?? '');
            if (tariffSlots && tariffSlots.length > 0) {
                const peakSlot = tariffSlots.find((s: any) => s.slot_type === 'peak');
                const offPeakSlot = tariffSlots.find((s: any) => s.slot_type === 'off-peak');
                if (peakSlot?.rate) peakRate = peakSlot.rate;
                if (offPeakSlot?.rate) offPeakRate = offPeakSlot.rate;
            }
        } catch { /* use defaults 9.55 / 6.31 */ }
        const rateDiff = Math.max(0, peakRate - offPeakRate);

        // ── Optimization comparison using REAL carbon intensities ──
        // Calculate kWh shifted from control_logs (optimizer/autopilot actions)
        const { data: shiftLogs } = await supabase
            .from('control_logs')
            .select('appliance_id, action, created_at, appliances(rated_power_w)')
            .eq('trigger_source', 'optimizer_batch')
            .gte('created_at', firstOfMonthStr)
            .order('created_at', { ascending: true });

        // Estimate kWh shifted: each turn_off during peak saves ~2hr of runtime at rated power
        let kwhShifted = 0;
        if (shiftLogs && shiftLogs.length > 0) {
            kwhShifted = shiftLogs.reduce((sum, log) => {
                const wattage = (log.appliances as any)?.rated_power_w || 1000;
                return sum + (wattage / 1000) * 2; // ~2 hours per shift action
            }, 0);
            kwhShifted = Math.round(kwhShifted * 10) / 10;
        }

        // Also account for autopilot-triggered shifts
        const { data: autopilotLogs } = await supabase
            .from('control_logs')
            .select('appliance_id, action, appliances(rated_power_w)')
            .in('trigger_source', ['autopilot', 'scheduler'])
            .eq('action', 'turn_off')
            .gte('created_at', firstOfMonthStr);

        if (autopilotLogs && autopilotLogs.length > 0) {
            const autopilotKwh = autopilotLogs.reduce((sum, log) => {
                const wattage = (log.appliances as any)?.rated_power_w || 1000;
                return sum + (wattage / 1000) * 1.5; // ~1.5 hours per autopilot action
            }, 0);
            kwhShifted += Math.round(autopilotKwh * 10) / 10;
        }

        // Fallback: if no logs yet, estimate from general monthSavings
        if (kwhShifted === 0 && stats.monthSavings > 0) {
            kwhShifted = rateDiff > 0 ? Math.round((stats.monthSavings / rateDiff) * 10) / 10 : 0;
        }

        // ── Tariff savings from load shifting ────────────────────────
        // "How much money saved?" = kWh shifted × (peak rate − off-peak rate)
        const shiftingSavingsRs = Math.round(kwhShifted * rateDiff);

        const withoutOptimizationKg = Math.round(kwhShifted * peakEmission * 100) / 100;
        const withOptimizationKg = Math.round(kwhShifted * offPeakEmission * 100) / 100;
        const co2AvoidedKg = Math.round((withoutOptimizationKg - withOptimizationKg) * 100) / 100;

        // Trees equivalent
        const treesEquivalent = co2AvoidedKg > 0
            ? Math.round((co2AvoidedKg / CO2_PER_TREE_PER_MONTH) * 10) / 10
            : 0;

        // Neighborhood average estimate (regional_avg × random variance)
        const neighborhoodAvgKg = Math.round(REGIONAL_AVERAGE_KWH * (carbonIntensities.dailyAvg / 1000) * 0.9);

        return {
            totalEmittedKg, monthlyKwh: Math.round(monthlyKwh), monthChangePercent,
            perCapitaKg, householdMembers, co2ReducedViaShiftKg: co2AvoidedKg,
            kwhShifted, withoutOptimizationKg, withOptimizationKg, co2AvoidedKg,
            monthSavings: shiftingSavingsRs,      // ₹ saved = kwhShifted × (peakRate − offPeakRate)
            peakCarbonIntensity: carbonIntensities.peakAvg,
            offPeakCarbonIntensity: carbonIntensities.offPeakAvg,
            treesEquivalent, neighborhoodAvgKg, trendData,
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
        const dashboard = await getCarbonDashboard(homeId);
        if (!dashboard) return null;
        return {
            user: Math.round(dashboard.monthlyKwh),
            neighbors: dashboard.neighborhoodAvgKg,
            national: REGIONAL_AVERAGE_KWH,
            trees: Math.max(0, Math.floor(dashboard.treesEquivalent)),
            co2Saved: Math.max(0, Math.round(dashboard.co2AvoidedKg)),
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
