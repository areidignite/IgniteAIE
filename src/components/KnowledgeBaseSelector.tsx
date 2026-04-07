import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface KnowledgeBase {
  knowledgeBaseId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const NONE_VALUE = '__none__';

interface KnowledgeBaseSelectorProps {
  selectedKnowledgeBase: string;
  onKnowledgeBaseChange: (knowledgeBaseId: string) => void;
  onUseKnowledgeBaseChange: (useKb: boolean) => void;
  onRefresh: () => Promise<void>;
  knowledgeBases: KnowledgeBase[];
  isLoading: boolean;
  useKnowledgeBase: boolean;
}

export function KnowledgeBaseSelector({
  selectedKnowledgeBase,
  onKnowledgeBaseChange,
  onUseKnowledgeBaseChange,
  onRefresh,
  knowledgeBases,
  isLoading,
  useKnowledgeBase
}: KnowledgeBaseSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleChange = (value: string) => {
    if (value === NONE_VALUE) {
      onUseKnowledgeBaseChange(false);
    } else {
      onKnowledgeBaseChange(value);
      onUseKnowledgeBaseChange(true);
    }
  };

  const displayValue = useKnowledgeBase ? selectedKnowledgeBase : NONE_VALUE;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Knowledge Base
      </label>
      <div className="flex gap-2">
        <select
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isLoading || isRefreshing}
          className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
        >
          <option value={NONE_VALUE}>None - Direct AI Query</option>
          {knowledgeBases.map((kb) => (
            <option key={kb.knowledgeBaseId} value={kb.knowledgeBaseId}>
              {kb.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 rounded-lg transition-colors flex items-center gap-2"
          title="Refresh knowledge bases list"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {useKnowledgeBase && knowledgeBases.length > 0 && selectedKnowledgeBase && (() => {
        const selected = knowledgeBases.find(kb => kb.knowledgeBaseId === selectedKnowledgeBase);
        return (
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            {selected?.description && <p>{selected.description}</p>}
            <p>Status: {selected?.status}</p>
          </div>
        );
      })()}
      {!useKnowledgeBase && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Queries will go directly to the foundation model without document retrieval.
        </p>
      )}
    </div>
  );
}
