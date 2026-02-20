
import { Appliance, ApplianceStatus, Achievement, Challenge } from './types';
import { Zap, Tv, Thermometer, Wind, Monitor, Coffee } from 'lucide-react';

// Single source of truth for Dashboard numbers to ensure Home & Insights match
// TODO: Replace mock data with API call — see services/api.ts
export const DASHBOARD_STATS = {
  // ── Recharge Balance (primary hero gauge data) ──
  balance: 550,                // Current remaining balance in ₹
  lastRechargeAmount: 2000,     // Last recharge amount in ₹
  lastRechargeDate: '03 March, 2026',  // Date of last recharge
  balancePercent: 75,           // (balance / lastRechargeAmount) * 100 — computed by backend
  dailyAvgUsage: 61.63,         // Average daily consumption in ₹
  currentTariff: 6.50,          // Current tariff rate in ₹/kWh
  yearAverage: 22500,           // Average usage this year in ₹

  // ── Usage stats ──
  currentLoad: 1.8, // kW
  todayCost: 78.50,
  todayKwh: 12.5,
  monthBill: 892, // Forecast
  monthSavings: 267,
  activeDevices: 5,
};

export const MOCK_APPLIANCES: Appliance[] = [
  {
    id: '1',
    name: 'AC - Living Room',
    icon: 'wind',
    status: ApplianceStatus.ON,
    power: 1200,
    costPerHour: 10.80,
    runtime: '2h 15m',
    message: 'Peak Hour! +₹3.20/hr extra',
    savingPotential: 32
  },
  {
    id: '2',
    name: 'Geyser',
    icon: 'thermometer',
    status: ApplianceStatus.WARNING,
    power: 2000,
    costPerHour: 18.00,
    runtime: '8 mins',
    message: 'Expensive! Shift to 6 AM',
    savingPotential: 14
  },
  {
    id: '3',
    name: 'Refrigerator',
    icon: 'box',
    status: ApplianceStatus.ON,
    power: 150,
    costPerHour: 1.35,
    message: 'Efficient operation'
  },
  {
    id: '4',
    name: 'Washing Machine',
    icon: 'disc',
    status: ApplianceStatus.SCHEDULED,
    power: 0,
    costPerHour: 0,
    scheduleTime: 'Tonight 11 PM',
    message: 'Off-peak timing set'
  }
];

// For the Insights "Appliances ON" card - quick visual preview
export const ACTIVE_DEVICES_PREVIEW = [
  { icon: 'wind', color: 'text-cyan-500', bg: 'bg-cyan-50' },
  { icon: 'thermometer', color: 'text-rose-500', bg: 'bg-rose-50' },
  { icon: 'box', color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { icon: 'tv', color: 'text-indigo-500', bg: 'bg-indigo-50' },
  { icon: 'light', color: 'text-amber-500', bg: 'bg-amber-50' }
];

export const ACHIEVEMENTS: Achievement[] = [
  { id: '1', title: 'Peak Saver', description: 'No heavy usage 6-10 PM', icon: 'zap', unlocked: true },
  { id: '2', title: 'Early Bird', description: 'Run appliances before 8 AM', icon: 'sun', unlocked: true },
  { id: '3', title: 'Eco Champion', description: 'Reduce carbon footprint by 10%', icon: 'leaf', unlocked: false, progress: 65, total: 100 },
  { id: '4', title: 'Solar Pioneer', description: 'Connect solar input', icon: 'sun-dim', unlocked: false, progress: 0, total: 1 }
];

export const CHALLENGES: Challenge[] = [
  { id: '1', title: 'Peak Hour Hero', daysLeft: 2, progress: 5, total: 7, reward: 1000 },
  { id: '2', title: 'Weekend Warrior', daysLeft: 4, progress: 1, total: 2, reward: 500 }
];

export const CHART_DATA_DONUT = [
  { name: 'AC', value: 45, fill: '#0ea5e9' }, // Sky 500
  { name: 'Geyser', value: 22, fill: '#f59e0b' }, // Amber 500
  { name: 'Fridge', value: 15, fill: '#10b981' }, // Emerald 500
  { name: 'Washing', value: 8, fill: '#a855f7' }, // Purple 500
  { name: 'Others', value: 10, fill: '#64748b' }, // Slate 500
];

export const CHART_DATA_TRENDS = [
  { day: '1', kwh: 12 }, { day: '5', kwh: 15 }, { day: '10', kwh: 8 },
  { day: '15', kwh: 22 }, { day: '20', kwh: 10 }, { day: '25', kwh: 14 },
  { day: '30', kwh: 11 }
];

export const SPARKLINE_DATA = [
  { value: 10 }, { value: 15 }, { value: 12 }, { value: 20 }, { value: 18 }, { value: 25 }, { value: 22 }
];

export const TARIFF_RATES = [
  { hour: '12AM', rate: 4, type: 'off-peak' },
  { hour: '2AM', rate: 4, type: 'off-peak' },
  { hour: '4AM', rate: 4, type: 'off-peak' },
  { hour: '6AM', rate: 6, type: 'normal' },
  { hour: '8AM', rate: 9, type: 'peak' },
  { hour: '10AM', rate: 9, type: 'peak' },
  { hour: '12PM', rate: 9, type: 'peak' },
  { hour: '2PM', rate: 6, type: 'normal' },
  { hour: '4PM', rate: 6, type: 'normal' },
  { hour: '6PM', rate: 9, type: 'peak' },
  { hour: '8PM', rate: 9, type: 'peak' },
  { hour: '10PM', rate: 6, type: 'normal' },
];

export const CARBON_STATS = {
  user: 145,      // Your usage
  neighbors: 180, // Avg neighbor
  national: 250,  // National avg
  trees: 12,
  co2Saved: 67
};

export const CARBON_COMPARISON_DATA = [
  { name: 'You', value: 145, fill: '#10b981' }, // Emerald
  { name: 'Neighbors', value: 180, fill: '#f59e0b' }, // Amber
  { name: 'National', value: 250, fill: '#64748b' }, // Slate
];
