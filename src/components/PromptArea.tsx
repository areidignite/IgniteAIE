import { useState } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface PromptAreaProps {
  onSubmit: (prompt: string) => Promise<void>;
  isLoading: boolean;
  onImprovePrompt?: (prompt: string, companyVoice: 'ignite-it' | 'ignite-action') => Promise<string>;
  isImprovingPrompt?: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
}

export function PromptArea({ onSubmit, isLoading, onImprovePrompt, isImprovingPrompt, prompt, onPromptChange }: PromptAreaProps) {
  const [companyVoice, setCompanyVoice] = useState<'ignite-it' | 'ignite-action'>('ignite-it');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isLoading) {
      await onSubmit(prompt);
    }
  };

  const handleImprovePrompt = async () => {
    if (prompt.trim() && onImprovePrompt && !isImprovingPrompt && !isLoading) {
      const improvedPrompt = await onImprovePrompt(prompt, companyVoice);
      onPromptChange(improvedPrompt);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Ask a question about your knowledge base... (e.g., What is our cloud migration strategy?)"
          className="w-full min-h-[200px] p-3 border-2 border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-800 placeholder-slate-400 dark:placeholder-slate-500"
          disabled={isLoading || isImprovingPrompt}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {onImprovePrompt && (
            <>
              <button
                type="button"
                onClick={handleImprovePrompt}
                disabled={isLoading || isImprovingPrompt || !prompt.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isImprovingPrompt ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Improving...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Improve Prompt
                  </>
                )}
              </button>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="company-voice"
                    value="ignite-it"
                    checked={companyVoice === 'ignite-it'}
                    onChange={(e) => setCompanyVoice(e.target.value as 'ignite-it' | 'ignite-action')}
                    disabled={isLoading || isImprovingPrompt || !prompt.trim()}
                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 focus:ring-blue-500 focus:ring-2 disabled:cursor-not-allowed"
                  />
                  <span className={`text-xs font-medium ${isLoading || isImprovingPrompt || !prompt.trim() ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>Respond as Ignite IT</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="company-voice"
                    value="ignite-action"
                    checked={companyVoice === 'ignite-action'}
                    onChange={(e) => setCompanyVoice(e.target.value as 'ignite-it' | 'ignite-action')}
                    disabled={isLoading || isImprovingPrompt || !prompt.trim()}
                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 dark:border-slate-600 focus:ring-blue-500 focus:ring-2 disabled:cursor-not-allowed"
                  />
                  <span className={`text-xs font-medium ${isLoading || isImprovingPrompt || !prompt.trim() ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>Respond as IgniteAction</span>
                </label>
              </div>
            </>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || isImprovingPrompt || !prompt.trim()}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              Generate
            </>
          )}
        </button>
      </div>
    </form>
  );
}
