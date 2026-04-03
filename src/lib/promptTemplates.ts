import { supabase } from './supabase';

export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  is_favorite: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchTemplates(): Promise<PromptTemplate[]> {
  const { data, error } = await supabase
    .from('prompt_templates')
    .select('*')
    .order('is_favorite', { ascending: false })
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
  return data || [];
}

export async function createTemplate(
  userId: string,
  template: Omit<PromptTemplate, 'id' | 'user_id' | 'usage_count' | 'created_at' | 'updated_at'>
): Promise<PromptTemplate | null> {
  const { data, error } = await supabase
    .from('prompt_templates')
    .insert({
      user_id: userId,
      name: template.name,
      description: template.description,
      content: template.content,
      category: template.category,
      is_favorite: template.is_favorite,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating template:', error);
    return null;
  }
  return data;
}

export async function updateTemplate(
  id: string,
  updates: Partial<PromptTemplate>
): Promise<PromptTemplate | null> {
  const { data, error } = await supabase
    .from('prompt_templates')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating template:', error);
    return null;
  }
  return data;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('prompt_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting template:', error);
    return false;
  }
  return true;
}

export async function incrementUsageCount(id: string): Promise<void> {
  const { data } = await supabase
    .from('prompt_templates')
    .select('usage_count')
    .eq('id', id)
    .maybeSingle();

  if (data) {
    await supabase
      .from('prompt_templates')
      .update({ usage_count: (data.usage_count || 0) + 1 })
      .eq('id', id);
  }
}
