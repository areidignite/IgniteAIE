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
  supabaseAnonKey || 'placeholder-key'
);

export async function getValidSession() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session) {
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedSession) {
      throw new Error('Session expired. Please log in again.');
    }
    return refreshedSession;
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = session.expires_at || 0;
  const timeUntilExpiry = expiresAt - now;

  if (timeUntilExpiry < 60) {
    console.log('Token expiring soon, refreshing...');
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedSession) {
      throw new Error('Failed to refresh session. Please log in again.');
    }
    return refreshedSession;
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(session.access_token);
  if (userError || !user) {
    console.log('Token validation failed, refreshing...', userError);
    const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedSession) {
      throw new Error('Session invalid. Please log in again.');
    }
    return refreshedSession;
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
