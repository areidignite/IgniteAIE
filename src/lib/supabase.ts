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
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: 'supabase.auth.token',
      flowType: 'pkce'
    }
  }
);

// Helper function to get a valid session, refreshing if necessary
export async function getValidSession() {
  try {
    // First, try to get the current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Error getting session:', error);
      // Try to refresh the session
      const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError || !refreshedSession) {
        console.error('Error refreshing session:', refreshError);
        return null;
      }

      return refreshedSession;
    }

    // If no session, return null
    if (!session) {
      return null;
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const expiresAt = session.expires_at;
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 300; // 5 minutes buffer

    if (expiresAt && expiresAt - now < bufferTime) {
      console.log('Token expiring soon, refreshing...');
      const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError || !newSession) {
        console.error('Error refreshing session:', refreshError);
        // If refresh fails, try to use the current session if it's still technically valid
        if (expiresAt && expiresAt > now) {
          console.log('Using current session as fallback');
          return session;
        }
        return null;
      }

      return newSession;
    }

    return session;
  } catch (error) {
    console.error('Unexpected error in getValidSession:', error);
    // As a last resort, try to get the session without any checks
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session;
    } catch {
      return null;
    }
  }
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
