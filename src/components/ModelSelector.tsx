import { useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';

interface FoundationModel {
  modelArn: string;
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
  responseStreamingSupported: boolean;
  inferenceProfileId?: string;
  inferenceProfileName?: string;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelArn: string) => void;
  onRefresh: () => Promise<void>;
  models: FoundationModel[];
  isLoading: boolean;
  onSignOut?: () => void;
}

export function ModelSelector({ selectedModel, onModelChange, onRefresh, models, isLoading, onSignOut }: ModelSelectorProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        Foundation Model
      </label>
      <div className="flex gap-2">
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={isLoading || isRefreshing}
          className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-700 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
        >
          {models.length === 0 ? (
            <option value="">No models available</option>
          ) : (
            models.map((model) => (
              <option key={model.modelArn} value={model.modelArn}>
                {model.modelName} ({model.modelId}){model.inferenceProfileName ? ` - ${model.inferenceProfileName}` : ''}
              </option>
            ))
          )}
        </select>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 rounded-lg transition-colors flex items-center gap-2"
          title="Refresh models list"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
        {onSignOut && (
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        )}
      </div>
      {models.length > 0 && selectedModel && (() => {
        const selected = models.find(m => m.modelArn === selectedModel);
        return (
          <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p>{selected?.modelId}</p>
            {selected?.inferenceProfileName && (
              <p className="text-blue-600 dark:text-blue-400 font-medium">
                Inference Profile: {selected.inferenceProfileName}
              </p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
