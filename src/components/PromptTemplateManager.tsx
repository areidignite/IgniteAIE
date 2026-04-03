import { useState } from 'react';
import { X, Plus, Pencil, Trash2, Star, Search, FolderOpen } from 'lucide-react';
import type { PromptTemplate } from '../lib/promptTemplates';

interface PromptTemplateManagerProps {
  templates: PromptTemplate[];
  onClose: () => void;
  onSave: (template: Omit<PromptTemplate, 'id' | 'user_id' | 'usage_count' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdate: (id: string, updates: Partial<PromptTemplate>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onToggleFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  onUseTemplate: (template: PromptTemplate) => void;
}

type FormMode = 'list' | 'create' | 'edit';

const CATEGORIES = [
  'Technical Volume',
  'Past Performance',
  'Management Approach',
  'Staffing Plan',
  'Executive Summary',
  'Compliance Matrix',
  'Custom',
];

export function PromptTemplateManager({
  templates,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  onToggleFavorite,
  onUseTemplate,
}: PromptTemplateManagerProps) {
  const [mode, setMode] = useState<FormMode>('list');
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setDescription('');
    setContent('');
    setCategory('');
    setIsFavorite(false);
    setEditingTemplate(null);
  };

  const handleCreate = () => {
    resetForm();
    setMode('create');
  };

  const handleEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setDescription(template.description || '');
    setContent(template.content);
    setCategory(template.category || '');
    setIsFavorite(template.is_favorite);
    setMode('edit');
  };

  const handleSubmit = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      if (mode === 'edit' && editingTemplate) {
        await onUpdate(editingTemplate.id, {
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          category: category.trim(),
          is_favorite: isFavorite,
        });
      } else {
        await onSave({
          name: name.trim(),
          description: description.trim(),
          content: content.trim(),
          category: category.trim(),
          is_favorite: isFavorite,
        });
      }
      resetForm();
      setMode('list');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    setConfirmDelete(null);
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = !searchQuery ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !filterCategory || t.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
    return b.usage_count - a.usage_count;
  });

  const usedCategories = [...new Set(templates.map(t => t.category).filter(Boolean))];

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {mode === 'list' ? 'Prompt Templates' : mode === 'create' ? 'New Template' : 'Edit Template'}
            </h2>
          </div>
          <button
            onClick={mode === 'list' ? onClose : () => { resetForm(); setMode('list'); }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {mode === 'list' ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 space-y-3 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500"
                  />
                </div>
                {usedCategories.length > 0 && (
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Categories</option>
                    {usedCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  New
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {sortedTemplates.length === 0 ? (
                <div className="text-center py-12">
                  <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {templates.length === 0
                      ? 'No templates yet. Create one to save time on repeated prompts.'
                      : 'No templates match your search.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedTemplates.map(template => (
                    <div
                      key={template.id}
                      className="group border border-slate-200 dark:border-slate-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-sm transition-all"
                    >
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <button
                                onClick={() => onToggleFavorite(template.id, !template.is_favorite)}
                                className="flex-shrink-0"
                                title={template.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                              >
                                <Star
                                  className={`w-4 h-4 transition-colors ${
                                    template.is_favorite
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                                  }`}
                                />
                              </button>
                              <h3 className="font-medium text-slate-800 dark:text-slate-100 truncate text-sm">
                                {template.name}
                              </h3>
                              {template.category && (
                                <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-full">
                                  {template.category}
                                </span>
                              )}
                            </div>
                            {template.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 ml-6 line-clamp-1">
                                {template.description}
                              </p>
                            )}
                            <p className="text-xs text-slate-400 dark:text-slate-500 ml-6 line-clamp-2 font-mono bg-slate-50 dark:bg-slate-700/50 px-2 py-1 rounded">
                              {template.content}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => onUseTemplate(template)}
                              className="px-2.5 py-1 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                            >
                              Use
                            </button>
                            <button
                              onClick={() => handleEdit(template)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {confirmDelete === template.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(template.id)}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(template.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Technical Approach Response"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of when to use this template"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No Category</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input
                    type="checkbox"
                    checked={isFavorite}
                    onChange={(e) => setIsFavorite(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 dark:border-slate-600 rounded focus:ring-amber-500"
                  />
                  <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Favorite</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Prompt Content <span className="text-red-500">*</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your prompt template here. Use [PLACEHOLDER] for parts that change each time."
                rows={8}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-slate-400 dark:placeholder-slate-500 font-mono"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Tip: Use [BRACKETS] for variable sections, e.g., "Describe [COMPANY_NAME]'s approach to [TOPIC]"
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => { resetForm(); setMode('list'); }}
                className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || !content.trim() || saving}
                className="px-5 py-2 text-sm bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
