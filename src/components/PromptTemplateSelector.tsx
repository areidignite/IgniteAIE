import { useState, useRef, useEffect } from 'react';
import { LayoutTemplate as BookTemplate, Star, ChevronDown, Settings2 } from 'lucide-react';
import type { PromptTemplate } from '../lib/promptTemplates';

interface PromptTemplateSelectorProps {
  templates: PromptTemplate[];
  onSelect: (template: PromptTemplate) => void;
  onManage: () => void;
  onSaveCurrentPrompt: () => void;
  hasPromptText: boolean;
  disabled?: boolean;
}

export function PromptTemplateSelector({
  templates,
  onSelect,
  onManage,
  onSaveCurrentPrompt,
  hasPromptText,
  disabled,
}: PromptTemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const favorites = templates.filter(t => t.is_favorite);
  const recent = templates.filter(t => !t.is_favorite).slice(0, 5);

  const handleSelect = (template: PromptTemplate) => {
    onSelect(template);
    setOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        title="Prompt Templates"
      >
        <BookTemplate className="w-4 h-4" />
        Templates
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
          {templates.length === 0 ? (
            <div className="p-4 text-center">
              <BookTemplate className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                No templates yet. Save your frequently used prompts for quick access.
              </p>
              <div className="flex items-center justify-center gap-2">
                {hasPromptText && (
                  <button
                    onClick={() => { onSaveCurrentPrompt(); setOpen(false); }}
                    className="px-3 py-1.5 text-xs bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                  >
                    Save Current Prompt
                  </button>
                )}
                <button
                  onClick={() => { onManage(); setOpen(false); }}
                  className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Create Template
                </button>
              </div>
            </div>
          ) : (
            <>
              {favorites.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Favorites
                  </div>
                  {favorites.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-left group"
                    >
                      <Star className="w-3.5 h-3.5 mt-0.5 fill-amber-400 text-amber-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {t.name}
                        </div>
                        {t.description && (
                          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{t.description}</div>
                        )}
                      </div>
                      {t.category && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">
                          {t.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {recent.length > 0 && (
                <div className={`p-2 ${favorites.length > 0 ? 'border-t border-slate-100 dark:border-slate-700' : ''}`}>
                  <div className="px-2 py-1 text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    {favorites.length > 0 ? 'Recent' : 'Templates'}
                  </div>
                  {recent.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors text-left"
                    >
                      <BookTemplate className="w-3.5 h-3.5 mt-0.5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {t.name}
                        </div>
                        {t.description && (
                          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{t.description}</div>
                        )}
                      </div>
                      {t.category && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded">
                          {t.category}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-200 dark:border-slate-700 p-2 flex items-center justify-between gap-2">
                {hasPromptText && (
                  <button
                    onClick={() => { onSaveCurrentPrompt(); setOpen(false); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    Save Current Prompt
                  </button>
                )}
                <button
                  onClick={() => { onManage(); setOpen(false); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors ml-auto"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Manage Templates
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
