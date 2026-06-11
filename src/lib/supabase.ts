import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env file.');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'loaded' : 'missing');
  console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'loaded' : 'missing');
}

// In-memory storage fallback for when localStorage is blocked
class MemoryStorage {
  private storage: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.storage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }
}

// Try to detect if localStorage is available
let storageAdapter: Storage | MemoryStorage;
try {
  localStorage.setItem('__test__', 'test');
  localStorage.removeItem('__test__');
  storageAdapter = window.localStorage;
  console.log('Using localStorage for session storage');
} catch (e) {
  console.warn('localStorage blocked, using in-memory storage (sessions will not persist across page reloads)');
  storageAdapter = new MemoryStorage();
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: storageAdapter as Storage
    }
  }
);

export async function getValidSession() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export interface Document {
  id: string;
  user_id: string;
  title: string;
  prompt: string;
  content: string;
  used_knowledge_base?: boolean;
  knowledge_base_name?: string;
  model_arn?: string;
  model_name?: string;
  citations?: Array<{ text: string; location?: any }>;
  created_at: string;
  updated_at: string;
}
