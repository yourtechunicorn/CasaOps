import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
}

const isDemo = typeof window !== 'undefined' && window.location.hostname.startsWith('demo.')

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: isDemo ? 'demo' : 'public' }
})
