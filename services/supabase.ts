import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    const msg =
        '⚠️ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
        '   Local dev  → create .env.local with these vars\n' +
        '   Netlify    → set them in Site Settings → Environment Variables';
    console.error(msg);
    // In production, fail loudly instead of silently connecting to nowhere
    if (import.meta.env.PROD) {
        throw new Error(msg);
    }
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key'
)
