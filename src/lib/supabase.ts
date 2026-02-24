import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'loaded' : 'missing');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'loaded' : 'missing');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }
);

// Helper function to get a valid session, refreshing if necessary
export async function getValidSession() {
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error);
    return null;
  }

  // If no session, return null
  if (!session) {
    return null;
  }

  // Check if token is expired or about to expire (within 60 seconds)
  const expiresAt = session.expires_at;
  const now = Math.floor(Date.now() / 1000);

  if (expiresAt && expiresAt - now < 60) {
    console.log('Token expired or expiring soon, refreshing...');
    const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError) {
      console.error('Error refreshing session:', refreshError);
      // Session is invalid, sign out
      await supabase.auth.signOut();
      return null;
    }

    return newSession;
  }

  return session;
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  content: string;
  used_knowledge_base?: boolean;
  model_arn?: string;
  model_name?: string;
  citations?: Array<{ text: string; location?: any }>;
  created_at: string;
  updated_at: string;
}
