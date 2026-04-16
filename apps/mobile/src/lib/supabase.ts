import { createClient } from '@supabase/supabase-js';

// Should use env variables in production (expo-constants / .env)
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
