// Database row types — matches 02_setup.sql column names exactly
// These are the shapes returned by Supabase queries

export interface DBProfile {
    id: string;
    role: 'consumer' | 'admin' | 'super_admin';
    name: string;
    phone: string | null;
    consumer_number: string | null;
    avatar_url: string | null;
    location: string | null;
    household_members: number;
    onboarding_done: boolean;
    created_at: string;
    updated_at: string;
}

export interface DBDiscom {
    id: string;
    code: string;
    name: string;
    state: string;
    state_code: string;
    consumer_number_length: number;
    consumer_number_hint: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface DBHome {
    id: string;
    user_id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
    feeder_id: string | null;
    area: string | null;
    tariff_category: 'residential' | 'commercial' | 'industrial' | 'agricultural';
    tariff_plan_id: string | null;
    discom_id: string | null;
    sanctioned_load_kw: number;
    is_primary: boolean;
    created_at: string;
    updated_at: string;
}

export interface DBMeter {
    id: string;
    home_id: string;
    meter_number: string;
    meter_type: 'prepaid' | 'postpaid';
    manufacturer: string | null;
    installation_date: string | null;
    is_active: boolean;
    last_reading_at: string | null;
    balance_amount: number;
    last_recharge_amount: number;
    last_recharge_date: string | null;
    created_at: string;
    updated_at: string;
}

export interface DBTariffPlan {
    id: string;
    discom_id: string;
    name: string;
    state: string;
    category: 'residential' | 'commercial' | 'industrial' | 'agricultural';
    fixed_charge_per_kw: number;
    is_active: boolean;
    effective_from: string;
    effective_to: string | null;
    created_at: string;
    updated_at: string;
}

export interface DBTariffSlab {
    id: string;
    plan_id: string;
    from_kwh: number;
    to_kwh: number | null;
    rate_per_kwh: number;
    display_order: number;
    created_at: string;
}

export interface DBTariffSlot {
    id: string;
    plan_id: string;
    hour_label: string;
    start_hour: number;
    end_hour: number;
    rate: number;
    slot_type: 'off-peak' | 'normal' | 'peak';
    created_at: string;
}

export interface DBNotification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    icon: string | null;
    color: string | null;
    bg_color: string | null;
    is_read: boolean;
    created_at: string;
}

export interface DBBill {
    id: string;
    home_id: string;
    bill_month: string;
    from_date: string;
    to_date: string;
    total_kwh: number;
    base_amount: number;
    fixed_charge: number;
    tax_amount: number;
    surcharge_amount: number;
    total_amount: number;
    savings_amount: number;
    due_date: string | null;
    status: 'generated' | 'paid' | 'overdue' | 'partial';
    pdf_url: string | null;
    created_at: string;
}

export type ApplianceCategory = 'ac' | 'geyser' | 'refrigerator' | 'washing_machine' | 'fan' | 'tv' | 'lighting' | 'other';

export interface DBAppliance {
    id: string;
    home_id: string;
    name: string;
    icon: string;
    source: 'nilm' | 'smart_plug' | 'manual';
    category: ApplianceCategory;
    is_controllable: boolean;
    status: 'ON' | 'OFF' | 'SCHEDULED' | 'WARNING';
    rated_power_w: number;
    current_power_w: number | null;
    cost_per_hour: number;
    runtime_today: string | null;
    schedule_time: string | null;
    message: string | null;
    saving_potential: number | null;
    smart_plug_id: string | null;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface DBDailyAggregate {
    id: string;
    home_id: string;
    date: string;
    total_kwh: number;
    total_cost: number;
    peak_kwh: number;
    offpeak_kwh: number;
    peak_kw: number;
    created_at: string;
}

export interface DBCarbonStats {
    id: string;
    home_id: string;
    month: string;
    user_kg_co2: number;
    co2_saved_kg: number;
    trees_equivalent: number;
    neighbor_avg: number | null;
    national_avg: number | null;
    created_at: string;
}

export interface DBConsumerMaster {
    id: string;
    consumer_number: string;
    discom_id: string;
    discom_code: string;
    state: string;
    meter_number: string;
    tariff_category: 'residential' | 'commercial' | 'industrial' | 'agricultural';
    connection_type: 'prepaid' | 'postpaid';
    registered_name: string | null;
    registered_phone: string | null;
    sanctioned_load_kw: number;
    is_active: boolean;
    created_at: string;
}
