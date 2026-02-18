export type Tab = 'Home' | 'Insights' | 'Rewards' | 'Control' | 'Profile' | 'Optimizer' | 'SmartPlugSetup' | 'BillHistory' | 'Notifications';

export enum ApplianceStatus {
  ON = 'ON',
  OFF = 'OFF',
  SCHEDULED = 'SCHEDULED',
  WARNING = 'WARNING'
}

export interface Appliance {
  id: string;
  name: string;
  icon: string;
  status: ApplianceStatus;
  power: number; // in Watts
  costPerHour: number;
  runtime?: string;
  scheduleTime?: string;
  message?: string;
  savingPotential?: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress?: number;
  total?: number;
}

export interface Challenge {
  id: string;
  title: string;
  daysLeft: number;
  progress: number;
  total: number;
  reward: number;
}