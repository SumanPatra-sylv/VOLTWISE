/**
 * Analytics Calculator — Real consumption data aggregation & calculations
 * 
 * Generates hourly, daily, weekly, monthly analytics from:
 * - daily_aggregates table (real historical data)
 * - appliances table (real-time status)
 * - tariff_slots (for peak/off-peak calculation)
 */

import { supabase } from '../services/supabase';
import { DBTariffSlot } from '../types/database';

// ── Types ────────────────────────────────────────────────────────

export interface HourlyDataPoint {
  hour: string;           // "12 AM", "1 AM", etc
  hourNum: number;        // 0-23
  kwh: number;
  cost: number;
  slotType: 'peak' | 'normal' | 'off-peak';
  tariffRate: number;     // ₹/kWh for this hour
  appliances: {
    category: string;
    kwh: number;
    cost: number;
  }[];
}

export interface DailyDataPoint {
  date: string;           // "Mon", "Tue", etc
  dateObj: Date;
  kwh: number;
  cost: number;
  peakKwh: number;
  normalKwh: number;
  offPeakKwh: number;
}

export interface WeeklyDataPoint {
  week: string;           // "Week 1", "Week 2", etc
  weekNum: number;
  kwh: number;
  cost: number;
  days: DailyDataPoint[];
}

export interface MonthlyDataPoint {
  week: string;           // "Week 1", "Week 2", etc
  weekNum: number;
  kwh: number;
  cost: number;
}

export interface ElectricityUsageSummary {
  totalKwh: number;
  totalCost: number;
  peakKwh: number;
  normalKwh: number;
  offPeakKwh: number;
  averageHourlyKwh: number;
  peakHours: string;      // e.g., "7:00 PM - 9:00 PM"
  offPeakHours: string;   // e.g., "2:00 AM - 5:00 AM"
}

// ── Helpers ────────────────────────────────────────────────────────

function formatHour(hourNum: number): string {
  const period = hourNum >= 12 ? 'PM' : 'AM';
  const hour12 = hourNum % 12 || 12;
  return `${hour12} ${period}`;
}

function getSlotForHour(hourNum: number, slots: DBTariffSlot[]): DBTariffSlot | null {
  for (const slot of slots) {
    // Handle midnight crossing (e.g., 22-6 = 10 PM to 6 AM)
    if (slot.start_hour <= slot.end_hour) {
      if (hourNum >= slot.start_hour && hourNum < slot.end_hour) return slot;
    } else {
      if (hourNum >= slot.start_hour || hourNum < slot.end_hour) return slot;
    }
  }
  return null;
}

// ── Fetch Real Data ─────────────────────────────────────────────

/**
 * Fetch daily aggregates for the past N days
 */
export async function fetchDailyAggregates(
  homeId: string,
  days: number = 30
): Promise<{ date: string; total_kwh: number; cost: number; peak_kwh?: number; normal_kwh?: number; offpeak_kwh?: number }[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('daily_aggregates')
    .select('date, total_kwh, cost, peak_kwh, normal_kwh, offpeak_kwh')
    .eq('home_id', homeId)
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) {
    console.error('[Analytics] Failed to fetch daily aggregates:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch appliance count and power distribution
 */
export async function fetchApplianceBreakdown(homeId: string): Promise<{
  category: string;
  totalPowerW: number;
  count: number;
}[]> {
  const { data, error } = await supabase
    .from('appliances')
    .select('category, rated_power_w')
    .eq('home_id', homeId)
    .eq('is_active', true);

  if (error) {
    console.error('[Analytics] Failed to fetch appliances:', error);
    return [];
  }

  const breakdown: Record<string, { totalPowerW: number; count: number }> = {};
  for (const app of data || []) {
    if (!breakdown[app.category]) {
      breakdown[app.category] = { totalPowerW: 0, count: 0 };
    }
    breakdown[app.category].totalPowerW += app.rated_power_w || 0;
    breakdown[app.category].count += 1;
  }

  return Object.entries(breakdown).map(([category, { totalPowerW, count }]) => ({
    category,
    totalPowerW,
    count,
  }));
}

// ── Calculate Hourly Data ────────────────────────────────────────

/**
 * Generate hourly breakdown for TODAY
 * Real calculation based on daily_aggregates split by hours
 */
export async function calculateHourlyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{ data: HourlyDataPoint[]; summary: ElectricityUsageSummary }> {
  const today = new Date().toISOString().split('T')[0];

  const { data: dailyData, error: dailyError } = await supabase
    .from('daily_aggregates')
    .select('total_kwh, cost, peak_kwh, normal_kwh, offpeak_kwh')
    .eq('home_id', homeId)
    .eq('date', today)
    .single();

  if (dailyError) {
    console.error('[Analytics] No data for today yet:', dailyError);
    return {
      data: generateEmptyHourlyData(tariffSlots),
      summary: {
        totalKwh: 0,
        totalCost: 0,
        peakKwh: 0,
        normalKwh: 0,
        offPeakKwh: 0,
        averageHourlyKwh: 0,
        peakHours: '6 PM - 10 PM',
        offPeakHours: '2 AM - 6 AM',
      },
    };
  }

  const totalKwh = dailyData?.total_kwh || 0;
  const totalCost = dailyData?.cost || 0;
  const peakKwh = dailyData?.peak_kwh || 0;
  const normalKwh = dailyData?.normal_kwh || 0;
  const offPeakKwh = dailyData?.offpeak_kwh || 0;

  // Distribute kWh across hours proportionally (24 hours)
  const hourlyKwh = totalKwh / 24;
  const hourlyData: HourlyDataPoint[] = [];

  for (let hour = 0; hour < 24; hour++) {
    const slot = getSlotForHour(hour, tariffSlots);
    const slotType = (slot?.slot_type || 'normal') as 'peak' | 'normal' | 'off-peak';
    const tariffRate = slot?.rate || 7.0;
    const kwh = hourlyKwh;
    const cost = (kwh / 1000) * tariffRate;

    hourlyData.push({
      hour: formatHour(hour),
      hourNum: hour,
      kwh: Math.round(kwh * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      slotType,
      tariffRate,
      appliances: [],
    });
  }

  // Find peak and off-peak hours
  let peakHours = '';
  let offPeakHours = '';
  const peakHourNums: number[] = [];
  const offPeakHourNums: number[] = [];

  hourlyData.forEach((h) => {
    if (h.slotType === 'peak') peakHourNums.push(h.hourNum);
    if (h.slotType === 'off-peak') offPeakHourNums.push(h.hourNum);
  });

  if (peakHourNums.length > 0) {
    const peakStart = peakHourNums[0];
    const peakEnd = peakHourNums[peakHourNums.length - 1] + 1;
    peakHours = `${formatHour(peakStart)} - ${formatHour(peakEnd)}`;
  }

  if (offPeakHourNums.length > 0) {
    const offStart = offPeakHourNums[0];
    const offEnd = offPeakHourNums[offPeakHourNums.length - 1] + 1;
    offPeakHours = `${formatHour(offStart)} - ${formatHour(offEnd)}`;
  }

  const summary: ElectricityUsageSummary = {
    totalKwh: Math.round(totalKwh * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    peakKwh: Math.round(peakKwh * 100) / 100,
    normalKwh: Math.round(normalKwh * 100) / 100,
    offPeakKwh: Math.round(offPeakKwh * 100) / 100,
    averageHourlyKwh: Math.round(hourlyKwh * 100) / 100,
    peakHours,
    offPeakHours,
  };

  return { data: hourlyData, summary };
}

function generateEmptyHourlyData(tariffSlots: DBTariffSlot[]): HourlyDataPoint[] {
  const data: HourlyDataPoint[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const slot = getSlotForHour(hour, tariffSlots);
    const slotType = (slot?.slot_type || 'normal') as 'peak' | 'normal' | 'off-peak';
    const tariffRate = slot?.rate || 7.0;

    data.push({
      hour: formatHour(hour),
      hourNum: hour,
      kwh: 0,
      cost: 0,
      slotType,
      tariffRate,
      appliances: [],
    });
  }
  return data;
}

// ── Calculate Daily Data (Last 7 Days) ───────────────────────────

export async function calculateDailyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{ data: DailyDataPoint[]; summary: ElectricityUsageSummary }> {
  const dailyAggregates = await fetchDailyAggregates(homeId, 7);

  const data: DailyDataPoint[] = [];
  let totalKwh = 0;
  let totalCost = 0;
  let totalPeakKwh = 0;
  let totalNormalKwh = 0;
  let totalOffPeakKwh = 0;

  // Fill last 7 days
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

    const dayData = dailyAggregates.find((d) => d.date === dateStr);
    const kwh = dayData?.total_kwh || 0;
    const cost = dayData?.cost || 0;
    const peakKwh = dayData?.peak_kwh || 0;
    const normalKwh = dayData?.normal_kwh || 0;
    const offPeakKwh = dayData?.offpeak_kwh || 0;

    totalKwh += kwh;
    totalCost += cost;
    totalPeakKwh += peakKwh;
    totalNormalKwh += normalKwh;
    totalOffPeakKwh += offPeakKwh;

    data.push({
      date: dayName,
      dateObj: date,
      kwh: Math.round(kwh * 100) / 100,
      cost: Math.round(cost * 100) / 100,
      peakKwh: Math.round(peakKwh * 100) / 100,
      normalKwh: Math.round(normalKwh * 100) / 100,
      offPeakKwh: Math.round(offPeakKwh * 100) / 100,
    });
  }

  const summary: ElectricityUsageSummary = {
    totalKwh: Math.round(totalKwh * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    peakKwh: Math.round(totalPeakKwh * 100) / 100,
    normalKwh: Math.round(totalNormalKwh * 100) / 100,
    offPeakKwh: Math.round(totalOffPeakKwh * 100) / 100,
    averageHourlyKwh: Math.round((totalKwh / (7 * 24)) * 100) / 100,
    peakHours: '6 PM - 10 PM',
    offPeakHours: '2 AM - 6 AM',
  };

  return { data, summary };
}

// ── Calculate Weekly Data (Last 4 Weeks) ─────────────────────────

export async function calculateWeeklyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{ data: WeeklyDataPoint[]; summary: ElectricityUsageSummary }> {
  const dailyAggregates = await fetchDailyAggregates(homeId, 28);

  const weeks: WeeklyDataPoint[] = [];
  let totalKwh = 0;
  let totalCost = 0;
  let totalPeakKwh = 0;
  let totalNormalKwh = 0;
  let totalOffPeakKwh = 0;

  // Group into 4 weeks
  for (let week = 0; week < 4; week++) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (28 - week * 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    let weekKwh = 0;
    let weekCost = 0;
    const weekDays: DailyDataPoint[] = [];

    for (let day = 0; day < 7; day++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + day);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

      const dayData = dailyAggregates.find((d) => d.date === dateStr);
      const kwh = dayData?.total_kwh || 0;
      const cost = dayData?.cost || 0;

      weekKwh += kwh;
      weekCost += cost;
      totalKwh += kwh;
      totalCost += cost;
      totalPeakKwh += dayData?.peak_kwh || 0;
      totalNormalKwh += dayData?.normal_kwh || 0;
      totalOffPeakKwh += dayData?.offpeak_kwh || 0;

      weekDays.push({
        date: dayName,
        dateObj: date,
        kwh: Math.round(kwh * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        peakKwh: dayData?.peak_kwh || 0,
        normalKwh: dayData?.normal_kwh || 0,
        offPeakKwh: dayData?.offpeak_kwh || 0,
      });
    }

    weeks.push({
      week: `Week ${week + 1}`,
      weekNum: week + 1,
      kwh: Math.round(weekKwh * 100) / 100,
      cost: Math.round(weekCost * 100) / 100,
      days: weekDays,
    });
  }

  const summary: ElectricityUsageSummary = {
    totalKwh: Math.round(totalKwh * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    peakKwh: Math.round(totalPeakKwh * 100) / 100,
    normalKwh: Math.round(totalNormalKwh * 100) / 100,
    offPeakKwh: Math.round(totalOffPeakKwh * 100) / 100,
    averageHourlyKwh: Math.round((totalKwh / (28 * 24)) * 100) / 100,
    peakHours: '6 PM - 10 PM',
    offPeakHours: '2 AM - 6 AM',
  };

  return { data: weeks, summary };
}

// ── Calculate Monthly Data (This Month vs Last Month) ─────────────

export async function calculateMonthlyComparison(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  thisMonth: ElectricityUsageSummary;
  lastMonth: ElectricityUsageSummary;
  changePercent: number;
}> {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const { data: thisMonthData, error: thisError } = await supabase
    .from('daily_aggregates')
    .select('total_kwh, cost, peak_kwh, normal_kwh, offpeak_kwh')
    .eq('home_id', homeId)
    .gte('date', monthStart.toISOString().split('T')[0])
    .lte('date', monthEnd.toISOString().split('T')[0]);

  const { data: lastMonthData, error: lastError } = await supabase
    .from('daily_aggregates')
    .select('total_kwh, cost, peak_kwh, normal_kwh, offpeak_kwh')
    .eq('home_id', homeId)
    .gte('date', lastMonthStart.toISOString().split('T')[0])
    .lte('date', lastMonthEnd.toISOString().split('T')[0]);

  const calculateSummary = (data: any[]): ElectricityUsageSummary => {
    const totals = data?.reduce(
      (acc, d) => ({
        totalKwh: acc.totalKwh + (d.total_kwh || 0),
        totalCost: acc.totalCost + (d.cost || 0),
        peakKwh: acc.peakKwh + (d.peak_kwh || 0),
        normalKwh: acc.normalKwh + (d.normal_kwh || 0),
        offPeakKwh: acc.offPeakKwh + (d.offpeak_kwh || 0),
      }),
      { totalKwh: 0, totalCost: 0, peakKwh: 0, normalKwh: 0, offPeakKwh: 0 }
    ) || { totalKwh: 0, totalCost: 0, peakKwh: 0, normalKwh: 0, offPeakKwh: 0 };

    const days = data?.length || 1;
    return {
      totalKwh: Math.round(totals.totalKwh * 100) / 100,
      totalCost: Math.round(totals.totalCost * 100) / 100,
      peakKwh: Math.round(totals.peakKwh * 100) / 100,
      normalKwh: Math.round(totals.normalKwh * 100) / 100,
      offPeakKwh: Math.round(totals.offPeakKwh * 100) / 100,
      averageHourlyKwh: Math.round((totals.totalKwh / (days * 24)) * 100) / 100,
      peakHours: '6 PM - 10 PM',
      offPeakHours: '2 AM - 6 AM',
    };
  };

  const thisMonthSummary = calculateSummary(thisMonthData || []);
  const lastMonthSummary = calculateSummary(lastMonthData || []);

  const changePercent =
    lastMonthSummary.totalKwh > 0
      ? Math.round(((thisMonthSummary.totalKwh - lastMonthSummary.totalKwh) / lastMonthSummary.totalKwh) * 100)
      : 0;

  return {
    thisMonth: thisMonthSummary,
    lastMonth: lastMonthSummary,
    changePercent,
  };
}
