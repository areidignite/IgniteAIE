import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useAutoSaveWorkspace(userId: string | undefined, content: string) {
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(content);
  const isInitialLoadRef = useRef(true);

  const saveToDb = useCallback(async (html: string) => {
    if (!userId) return;
    setSaveStatus('saving');
    const { error } = await supabase
      .from('workspace')
      .upsert({ user_id: userId, content: html }, { onConflict: 'user_id' });

    if (error) {
      console.error('Auto-save failed:', error);
      setSaveStatus('error');
    } else {
      lastSavedRef.current = html;
      setSaveStatus('saved');
    }
  }, [userId]);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      lastSavedRef.current = content;
      return;
    }

    if (content === lastSavedRef.current) return;

    setSaveStatus('idle');

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveToDb(content);
    }, 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, saveToDb]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await saveToDb(content);
  }, [content, saveToDb]);

  return { saveStatus, saveNow };
}
