import { createClient } from '@supabase/supabase-js';

// Prefer Vite-style envs (VITE_SUPABASE_URL/KEY), but fall back to process.env for node contexts.
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = import.meta.env?.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;
