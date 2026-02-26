/**
 * Tariff Optimization Math Engine
 *
 * Pure TypeScript utility — zero UI, fully testable.
 * All functions receive tariff slots as input; the caller is
 * responsible for fetching them from Supabase via fetchUserTariffSlots().
 *
 * Key concepts:
 * - "Heavy appliance" = optimization_tier is tier_1 / tier_2 / tier_3
 * - "Shiftable"       = tier_1 (can be auto-scheduled + auto-off)
 * - "Peak"            = the slot_type with the highest rate
 */

import { supabase } from '../services/supabase';
import { DBTariffSlot, DBAppliance, OptimizationTier } from '../types/database';

// ── Types ──────────────────────────────────────────────────────────

export interface ScheduleOption {
    label: string;            // "Run at Cheapest Time (12:00 AM)"
    startHour: number;        // 0-23
    slotType: string;         // "off-peak"
    ratePerKwh: number;       // 6.31
    costForDuration: number;  // ₹9.47 total cost
    savingsPercent: number;   // 34
    savingsAmount: number;    // ₹4.88 saved vs running now
}

export interface OptimizationResult {
    runNow: ScheduleOption;
    nextCheaper: ScheduleOption | null;  // null if already at cheapest
    cheapest: ScheduleOption;
    customTime?: ScheduleOption;         // filled when user picks a time
}

export interface HeavyAppliance {
    id: string;
    name: string;
    category: string;
    optimization_tier: OptimizationTier;
    rated_power_w: number;
    costPerHour: number;       // at current rate
    eco_mode_enabled: boolean;
}

export interface OptimizationAlert {
    isCurrentlyPeak: boolean;
    currentSlotType: string;
    currentRate: number;
    heavyAppliancesOn: HeavyAppliance[];
    totalSavingsPerHour: number;  // ₹ across all heavy appliances if shifted
}

// ── Constants ──────────────────────────────────────────────────────

/** Tiers that the optimizer cares about (everything except tier_4) */
const OPTIMIZABLE_TIERS: OptimizationTier[] = [
    'tier_1_shiftable',
    'tier_2_prep_needed',
    'tier_3_comfort',
];

/** Default tier mapping from category (used when tier not set in DB) */
export const CATEGORY_TO_TIER: Record<string, OptimizationTier> = {
    ac: 'tier_3_comfort',
    geyser: 'tier_1_shiftable',
    refrigerator: 'tier_4_essential',
    washing_machine: 'tier_2_prep_needed',
    fan: 'tier_4_essential',
    tv: 'tier_4_essential',
    lighting: 'tier_4_essential',
    other: 'tier_4_essential',
};

/** Eco mode simulates 15% power reduction (e.g. AC at 26°C) */
export const ECO_MODE_REDUCTION = 0.15;

// ── Helpers ────────────────────────────────────────────────────────

/** Format hour as 12-hr string, e.g. 22 → "10:00 PM", 0 → "12:00 AM" */
export function formatHour(hour: number): string {
    const h = hour % 24;
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${suffix}`;
}

/**
 * Check if a given hour falls within a tariff slot.
 * Handles midnight-crossing slots (e.g. 22→6 means 22,23,0,1,2,3,4,5).
 */
function isHourInSlot(hour: number, slot: DBTariffSlot): boolean {
    if (slot.start_hour < slot.end_hour) {
        return hour >= slot.start_hour && hour < slot.end_hour;
    }
    // Midnight crossing
    return hour >= slot.start_hour || hour < slot.end_hour;
}

/** Get the slot that contains a given hour */
export function getSlotForHour(hour: number, slots: DBTariffSlot[]): DBTariffSlot | null {
    return slots.find(s => isHourInSlot(hour, s)) || null;
}

/** Get all 24 hourly rates from slots */
function getHourlyRates(slots: DBTariffSlot[]): number[] {
    const rates: number[] = [];
    for (let h = 0; h < 24; h++) {
        const slot = getSlotForHour(h, slots);
        rates.push(slot?.rate || 0);
    }
    return rates;
}

// ── Core Calculations ──────────────────────────────────────────────

/**
 * Calculate cost for running an appliance starting at a given hour:minute
 * for a given duration. Handles multi-slot spans correctly.
 *
 * Example: 1500W appliance starting at 21:50 for 1 hour
 * → 10 min at peak rate (hour 21), 50 min at off-peak rate (hour 22)
 * → cost = (1.5kW × 10/60 × 9.55) + (1.5kW × 50/60 × 6.31) = ₹10.30
 *
 * @param startMinute Optional minute offset (0-59). When 0 (default),
 *   the first hour slot is treated as a full hour.
 */
export function calculateCostForTime(
    ratedPowerW: number,
    startHour: number,
    durationHours: number,
    slots: DBTariffSlot[],
    startMinute: number = 0
): number {
    const kw = ratedPowerW / 1000;
    const rates = getHourlyRates(slots);
    let totalCost = 0;
    let remaining = durationHours;

    for (let i = 0; remaining > 0; i++) {
        const hour = (startHour + i) % 24;
        // First iteration: only the remaining fraction of the starting hour
        // e.g. start at :50 → first block is 10/60 = 0.167 hours
        const maxForThisHour = i === 0 ? (60 - startMinute) / 60 : 1;
        const fraction = Math.min(remaining, maxForThisHour);
        totalCost += kw * rates[hour] * fraction;
        remaining -= fraction;
    }

    return Math.round(totalCost * 100) / 100;
}

/**
 * Calculate the 3 standardized schedule options for the InterceptorModal.
 * Returns: runNow, nextCheaper (chronological), cheapest (absolute).
 */
export function calculateScheduleOptions(
    ratedPowerW: number,
    durationHours: number,
    slots: DBTariffSlot[],
    currentHour: number
): OptimizationResult {
    const runNowCost = calculateCostForTime(ratedPowerW, currentHour, durationHours, slots);
    const currentSlot = getSlotForHour(currentHour, slots);

    const runNow: ScheduleOption = {
        label: 'Run Now',
        startHour: currentHour,
        slotType: currentSlot?.slot_type || 'normal',
        ratePerKwh: currentSlot?.rate || 0,
        costForDuration: runNowCost,
        savingsPercent: 0,
        savingsAmount: 0,
    };

    // Sort slots by rate ascending to find cheapest
    const sortedByRate = [...slots].sort((a, b) => a.rate - b.rate);

    // Find cheapest slot (absolute cheapest in next 24h)
    const cheapestSlot = sortedByRate[0];
    // Pick the start of the cheapest slot
    const cheapestStartHour = cheapestSlot.start_hour;
    const cheapestCost = calculateCostForTime(ratedPowerW, cheapestStartHour, durationHours, slots);
    const cheapestSavings = runNowCost - cheapestCost;

    const cheapest: ScheduleOption = {
        label: `Run at Cheapest Time (${formatHour(cheapestStartHour)})`,
        startHour: cheapestStartHour,
        slotType: cheapestSlot.slot_type,
        ratePerKwh: cheapestSlot.rate,
        costForDuration: cheapestCost,
        savingsPercent: runNowCost > 0 ? Math.round((cheapestSavings / runNowCost) * 100) : 0,
        savingsAmount: Math.round(cheapestSavings * 100) / 100,
    };

    // Find next cheaper slot (chronologically after current hour)
    let nextCheaper: ScheduleOption | null = null;
    const currentRate = currentSlot?.rate || 0;

    // Walk forward from current hour, find the first slot boundary with a lower rate
    for (let offset = 1; offset < 24; offset++) {
        const checkHour = (currentHour + offset) % 24;
        const checkSlot = getSlotForHour(checkHour, slots);
        if (checkSlot && checkSlot.rate < currentRate) {
            const cost = calculateCostForTime(ratedPowerW, checkHour, durationHours, slots);
            const savings = runNowCost - cost;
            nextCheaper = {
                label: `Run at Next Cheaper Time (${formatHour(checkHour)})`,
                startHour: checkHour,
                slotType: checkSlot.slot_type,
                ratePerKwh: checkSlot.rate,
                costForDuration: cost,
                savingsPercent: runNowCost > 0 ? Math.round((savings / runNowCost) * 100) : 0,
                savingsAmount: Math.round(savings * 100) / 100,
            };
            break;
        }
    }

    // If nextCheaper is the same as cheapest (same start), set to null
    if (nextCheaper && nextCheaper.startHour === cheapest.startHour) {
        nextCheaper = null;
    }

    return { runNow, nextCheaper, cheapest };
}

/**
 * Calculate a custom-time schedule option (user picks a specific hour).
 */
export function calculateCustomOption(
    ratedPowerW: number,
    durationHours: number,
    slots: DBTariffSlot[],
    currentHour: number,
    customStartHour: number
): ScheduleOption {
    const runNowCost = calculateCostForTime(ratedPowerW, currentHour, durationHours, slots);
    const customCost = calculateCostForTime(ratedPowerW, customStartHour, durationHours, slots);
    const savings = runNowCost - customCost;
    const customSlot = getSlotForHour(customStartHour, slots);

    return {
        label: `Run at ${formatHour(customStartHour)}`,
        startHour: customStartHour,
        slotType: customSlot?.slot_type || 'normal',
        ratePerKwh: customSlot?.rate || 0,
        costForDuration: customCost,
        savingsPercent: runNowCost > 0 ? Math.round((savings / runNowCost) * 100) : 0,
        savingsAmount: Math.round(savings * 100) / 100,
    };
}

// ── Alert Calculator ───────────────────────────────────────────────

/**
 * Calculate the optimization alert for the Home banner / Optimizer page.
 * Returns info about which heavy appliances are ON during peak and
 * total possible savings.
 */
export function calculateOptimizationAlert(
    appliances: DBAppliance[],
    slots: DBTariffSlot[],
    currentHour: number
): OptimizationAlert {
    const currentSlot = getSlotForHour(currentHour, slots);
    const currentRate = currentSlot?.rate || 0;
    const isPeak = currentSlot?.slot_type === 'peak';

    // Find the cheapest rate to calculate savings
    const cheapestRate = Math.min(...slots.map(s => s.rate));

    // Filter to heavy appliances (tier 1-3) that are currently ON
    const heavyOn = appliances
        .filter(a => {
            const tier = a.optimization_tier || CATEGORY_TO_TIER[a.category] || 'tier_4_essential';
            return (
                OPTIMIZABLE_TIERS.includes(tier) &&
                (a.status === 'ON' || a.status === 'WARNING') &&
                a.is_active
            );
        })
        .map(a => {
            const tier = a.optimization_tier || CATEGORY_TO_TIER[a.category] || 'tier_4_essential';
            // Apply eco mode reduction: if eco_mode_enabled, effective power is 85% of rated
            const effectivePowerW = a.eco_mode_enabled
                ? a.rated_power_w * (1 - ECO_MODE_REDUCTION)
                : a.rated_power_w;
            const costPerHour = (effectivePowerW / 1000) * currentRate;
            return {
                id: a.id,
                name: a.name,
                category: a.category,
                optimization_tier: tier as OptimizationTier,
                rated_power_w: a.rated_power_w,
                costPerHour: Math.round(costPerHour * 100) / 100,
                eco_mode_enabled: a.eco_mode_enabled,
            };
        });

    // Total savings = difference if all heavy appliances ran at cheapest rate
    // Also accounts for eco mode already being active
    const totalSavingsPerHour = heavyOn.reduce((sum, a) => {
        const effectivePowerW = a.eco_mode_enabled
            ? a.rated_power_w * (1 - ECO_MODE_REDUCTION)
            : a.rated_power_w;
        const currentCost = (effectivePowerW / 1000) * currentRate;
        const cheapestCost = (effectivePowerW / 1000) * cheapestRate;
        return sum + (currentCost - cheapestCost);
    }, 0);

    return {
        isCurrentlyPeak: isPeak,
        currentSlotType: currentSlot?.slot_type || 'normal',
        currentRate,
        heavyAppliancesOn: heavyOn,
        totalSavingsPerHour: Math.round(totalSavingsPerHour * 100) / 100,
    };
}

// ── Supabase Helper ────────────────────────────────────────────────

/**
 * Fetch tariff slots for the user's home from Supabase.
 * Resolves: homes.tariff_plan_id → tariff_slots.plan_id
 */
export async function fetchUserTariffSlots(homeId: string): Promise<DBTariffSlot[]> {
    // Get the tariff plan ID from the home
    const { data: home, error: homeErr } = await supabase
        .from('homes')
        .select('tariff_plan_id')
        .eq('id', homeId)
        .single();

    if (homeErr || !home?.tariff_plan_id) {
        console.warn('No tariff plan found for home:', homeId);
        return [];
    }

    // Fetch the slots for this plan
    const { data: slots, error: slotsErr } = await supabase
        .from('tariff_slots')
        .select('*')
        .eq('plan_id', home.tariff_plan_id)
        .order('start_hour', { ascending: true });

    if (slotsErr) {
        console.error('Failed to fetch tariff slots:', slotsErr);
        return [];
    }

    return slots || [];
}

/**
 * Check if an appliance is heavy (tier 1-3) and the current slot is peak.
 * Used by Control.tsx to decide whether to show the InterceptorModal.
 */
export function shouldIntercept(
    appliance: DBAppliance,
    slots: DBTariffSlot[],
    currentHour: number
): boolean {
    const tier = appliance.optimization_tier || CATEGORY_TO_TIER[appliance.category] || 'tier_4_essential';
    if (!OPTIMIZABLE_TIERS.includes(tier as OptimizationTier)) return false;

    const currentSlot = getSlotForHour(currentHour, slots);
    return currentSlot?.slot_type === 'peak';
}

/**
 * Check if scheduling an appliance at a specific hour falls during peak.
 * Used to warn users who schedule heavy appliances into peak windows.
 */
export function isScheduleInPeak(
    startHour: number,
    durationHours: number,
    slots: DBTariffSlot[]
): boolean {
    let remaining = durationHours;
    for (let i = 0; remaining > 0; i++) {
        const hour = (startHour + i) % 24;
        const slot = getSlotForHour(hour, slots);
        if (slot?.slot_type === 'peak') return true;
        remaining -= Math.min(remaining, 1);
    }
    return false;
}
