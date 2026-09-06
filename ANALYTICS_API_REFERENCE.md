# Analytics API & Integration Guide

## Public Exports from `analyticsCalculator.ts`

### Interfaces (Type Definitions)

#### `HourlyDataPoint`
```typescript
export interface HourlyDataPoint {
  hour: string;           // "12 AM", "1 AM", ..., "11 PM"
  hourNum: number;        // 0-23
  kwh: number;            // Consumption in kWh
  cost: number;           // Cost in ₹
  slotType: 'peak' | 'normal' | 'off-peak';
  tariffRate: number;     // ₹/kWh for this hour
  appliances: {
    category: string;     // "ac", "lighting", "refrigerator", etc
    kwh: number;
    cost: number;
  }[];
}
```

#### `DailyDataPoint`
```typescript
export interface DailyDataPoint {
  date: string;           // "Mon", "Tue", "Wed", etc
  dateObj: Date;          // Actual date object
  kwh: number;            // Total consumption
  cost: number;           // Total cost
  peakKwh: number;        // Peak hours consumption
  normalKwh: number;      // Normal hours consumption
  offPeakKwh: number;     // Off-peak hours consumption
}
```

#### `WeeklyDataPoint`
```typescript
export interface WeeklyDataPoint {
  week: string;           // "Week 1", "Week 2", etc
  weekNum: number;        // 1-4
  kwh: number;            // Total for week
  cost: number;           // Total cost for week
  days: DailyDataPoint[]; // 7 daily breakdowns
}
```

#### `ElectricityUsageSummary`
```typescript
export interface ElectricityUsageSummary {
  totalKwh: number;
  totalCost: number;
  peakKwh: number;
  normalKwh: number;
  offPeakKwh: number;
  averageHourlyKwh: number;
  peakHours: string;      // "6 PM - 10 PM"
  offPeakHours: string;   // "2 AM - 6 AM"
}
```

### Core Functions

#### `calculateHourlyData()`
**Purpose:** Get 24-hour breakdown for today
```typescript
export async function calculateHourlyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  data: HourlyDataPoint[];      // 24 hourly points
  summary: ElectricityUsageSummary;
}>

// Usage
const { data, summary } = await calculateHourlyData(homeId, tariffSlots);
console.log(data[0].hour);      // "12 AM"
console.log(summary.totalKwh);  // 4.2
```

#### `calculateDailyData()`
**Purpose:** Get 7-day trend
```typescript
export async function calculateDailyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  data: DailyDataPoint[];       // 7 daily points (last week)
  summary: ElectricityUsageSummary;
}>

// Usage
const { data, summary } = await calculateDailyData(homeId, tariffSlots);
console.log(data[0].date);      // "Mon"
console.log(data[0].peakKwh);   // 2.1
```

#### `calculateWeeklyData()`
**Purpose:** Get 4-week trend (last month)
```typescript
export async function calculateWeeklyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  data: WeeklyDataPoint[];      // 4 weekly points
  summary: ElectricityUsageSummary;
}>

// Usage
const { data, summary } = await calculateWeeklyData(homeId, tariffSlots);
console.log(data[0].week);      // "Week 1"
console.log(data[0].days.length); // 7
```

#### `calculateMonthlyComparison()`
**Purpose:** Compare this month vs last month
```typescript
export async function calculateMonthlyComparison(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  thisMonth: ElectricityUsageSummary;
  lastMonth: ElectricityUsageSummary;
  changePercent: number;        // +6.2 or -3.5
}>

// Usage
const comparison = await calculateMonthlyComparison(homeId, tariffSlots);
console.log(comparison.thisMonth.totalKwh);   // 125.6
console.log(comparison.lastMonth.totalKwh);   // 118.2
console.log(comparison.changePercent);        // +6.2
```

### Helper Functions

#### `fetchDailyAggregates()`
**Purpose:** Fetch raw consumption data from database
```typescript
export async function fetchDailyAggregates(
  homeId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  date: string;
  total_kwh: number;
  peak_kwh: number;
  normal_kwh: number;
  offpeak_kwh: number;
  total_cost: number;
  peak_cost: number;
  normal_cost: number;
  offpeak_cost: number;
}[]>

// Usage (internal, usually called by calculate* functions)
const data = await fetchDailyAggregates(
  homeId,
  new Date('2024-01-01'),
  new Date('2024-01-31')
);
```

#### `fetchApplianceBreakdown()`
**Purpose:** Get per-appliance category breakdown
```typescript
export async function fetchApplianceBreakdown(
  homeId: string
): Promise<{
  category: string;
  total_kwh: number;
  total_cost: number;
  device_count: number;
  last_active: string;
}[]>

// Usage
const breakdown = await fetchApplianceBreakdown(homeId);
console.log(breakdown[0].category);  // "air_conditioner"
console.log(breakdown[0].total_kwh); // 45.3
```

## Integration with LivePower.tsx

### Current Integration Points

#### State Variables
```typescript
const [usageTab, setUsageTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
const [hourlyData, setHourlyData] = useState<HourlyDataPoint[]>([]);
const [dailyData, setDailyData] = useState<DailyDataPoint[]>([]);
const [weeklyData, setWeeklyData] = useState<WeeklyDataPoint[]>([]);
const [monthlySummary, setMonthlySummary] = useState<{ 
  thisMonth: ElectricityUsageSummary;
  lastMonth: ElectricityUsageSummary;
  changePercent: number;
} | null>(null);
const [currentSummary, setCurrentSummary] = useState<ElectricityUsageSummary | null>(null);
const [usageLoading, setUsageLoading] = useState(false);
const [tariffSlots, setTariffSlots] = useState<DBTariffSlot[]>([]);
```

#### Effects
```typescript
// 1. Fetch tariff slots on mount
useEffect(() => {
  if (home?.id) {
    fetchUserTariffSlots(home.id)
      .then(setTariffSlots)
      .catch(err => {
        console.error('[LivePower] Failed to fetch tariff slots:', err);
        setTariffSlots([]);
      });
  }
}, [home?.id]);

// 2. Load all analytics data in parallel
useEffect(() => {
  if (!home?.id || tariffSlots.length === 0) return;
  
  const loadData = async () => {
    setUsageLoading(true);
    try {
      const [hourly, daily, weekly, monthly] = await Promise.all([
        calculateHourlyData(home.id, tariffSlots),
        calculateDailyData(home.id, tariffSlots),
        calculateWeeklyData(home.id, tariffSlots),
        calculateMonthlyComparison(home.id, tariffSlots),
      ]);
      
      setHourlyData(hourly.data);
      setDailyData(daily.data);
      setWeeklyData(weekly.data);
      setMonthlySummary(monthly);
      setCurrentSummary(hourly.summary); // Default to daily
    } catch (err) {
      console.error('[LivePower] Analytics error:', err);
    } finally {
      setUsageLoading(false);
    }
  };
  
  loadData();
}, [home?.id, tariffSlots]);

// 3. Update summary when tab changes
useEffect(() => {
  // Logic to recalculate summary based on usageTab
  // Updates currentSummary state
}, [usageTab, hourlyData, dailyData, weeklyData, monthlySummary]);
```

## How to Add Another Time Period View

### Step 1: Create Calculation Function
```typescript
// In analyticsCalculator.ts
export async function calculateYearlyData(
  homeId: string,
  tariffSlots: DBTariffSlot[]
): Promise<{
  data: YearlyDataPoint[];
  summary: ElectricityUsageSummary;
}> {
  // Fetch 12 months of daily_aggregates
  // Group into monthly buckets
  // Calculate peak/normal/off-peak for each month
  // Return 12 MonthlyDataPoint objects
}
```

### Step 2: Update Types
```typescript
export interface YearlyDataPoint {
  month: string;        // "Jan", "Feb", etc
  monthNum: number;     // 1-12
  kwh: number;
  cost: number;
  peakKwh: number;
  normalKwh: number;
  offPeakKwh: number;
}
```

### Step 3: Update LivePower.tsx
```typescript
// Add state
const [yearlyData, setYearlyData] = useState<YearlyDataPoint[]>([]);

// Update usageTab type
const [usageTab, setUsageTab] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

// Add to calculation effect
const yearly = await calculateYearlyData(home.id, tariffSlots);
setYearlyData(yearly.data);

// Add to summary update effect
} else if (usageTab === 'yearly' && yearlyData.length > 0) {
  // Calculate summary for yearly

// Add tab button
<button onClick={() => setUsageTab('yearly')}>Yearly</button>

// Add chart rendering
{usageTab === 'yearly' && yearlyData.length > 0 && (
  <BarChart data={yearlyData} ... />
)}
```

## Error Handling

### Pattern Used
```typescript
try {
  const result = await calculateHourlyData(homeId, tariffSlots);
  setData(result.data);
} catch (err) {
  console.error('[Context] Error:', err);
  // Graceful fallback - show empty state or last known data
} finally {
  setLoading(false);
}
```

### Possible Errors
| Error | Cause | Handling |
|-------|-------|----------|
| `homeId is undefined` | Home context not loaded | Check `if (home?.id)` before calling |
| `No tariff slots found` | Tariff not configured | Use default rates or show warning |
| `daily_aggregates is empty` | No consumption history | Show "No data available" |
| `Supabase connection failed` | Network or auth issue | Retry with exponential backoff |

## Performance Optimization

### Current Optimizations
- ✅ `Promise.all()` for parallel data fetching
- ✅ Conditional calculations (only when data available)
- ✅ Memoized slot detection for repeated calls
- ✅ Efficient data aggregation (O(n) algorithms)

### Future Optimizations
- [ ] Implement result caching (1 hour TTL)
- [ ] Add debouncing for rapid tab switches
- [ ] Virtualize large datasets in charts
- [ ] Lazy-load historical data (year-by-year)

## Database Schema Requirements

### daily_aggregates Table
```sql
CREATE TABLE daily_aggregates (
  id BIGINT PRIMARY KEY,
  home_id UUID NOT NULL,
  date DATE NOT NULL,
  total_kwh NUMERIC NOT NULL,
  peak_kwh NUMERIC NOT NULL,
  normal_kwh NUMERIC NOT NULL,
  offpeak_kwh NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  peak_cost NUMERIC NOT NULL,
  normal_cost NUMERIC NOT NULL,
  offpeak_cost NUMERIC NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### tariff_slots Table
```sql
CREATE TABLE tariff_slots (
  id BIGINT PRIMARY KEY,
  home_id UUID NOT NULL,
  from_hour INT NOT NULL,      -- 0-23
  to_hour INT NOT NULL,        -- 1-24
  slot_type VARCHAR NOT NULL,  -- 'peak', 'normal', 'off-peak'
  rate NUMERIC NOT NULL,       -- ₹/kWh
  created_at TIMESTAMP
);
```

## Testing Examples

### Unit Tests
```typescript
// Test hourly distribution
const result = await calculateHourlyData(homeId, slots);
expect(result.data.length).toBe(24);
expect(result.summary.totalKwh).toBeGreaterThan(0);

// Test peak detection
const peakHours = result.data.filter(d => d.slotType === 'peak');
expect(peakHours.length).toBeGreaterThan(0);

// Test cost calculation
const expectedCost = result.data[0].kwh * result.data[0].tariffRate;
expect(result.data[0].cost).toBeCloseTo(expectedCost, 2);
```

### Integration Tests
```typescript
// Mock daily_aggregates data
const mockData = [
  { date: '2024-01-01', total_kwh: 4.2, peak_kwh: 2.1, ... },
  { date: '2024-01-02', total_kwh: 3.8, peak_kwh: 1.9, ... },
];

// Test full flow
const result = await calculateDailyData(homeId, tariffSlots);
expect(result.data.length).toBe(7);
expect(result.summary.totalKwh).toBeGreaterThan(0);
```

---

## Summary

| Component | Lines | Exports | Purpose |
|-----------|-------|---------|---------|
| `analyticsCalculator.ts` | 474 | 9 (interfaces + functions) | Core calculation engine |
| `LivePower.tsx` | 956 | UI component | Display & user interaction |
| **Total** | **1,430** | - | Complete analytics system |

✅ **Ready to extend, test, and deploy!**
