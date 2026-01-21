import { useState, useRef } from 'react';
import { Send, Loader2, Sparkles, Paperclip, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AttachedFile {
  name: string;
  s3Key: string;
  size: number;
}

interface PromptAreaProps {
  onSubmit: (prompt: string, attachments?: AttachedFile[]) => Promise<void>;
  isLoading: boolean;
  onImprovePrompt?: (prompt: string, companyVoice: 'ignite-it' | 'ignite-action') => Promise<string>;
  isImprovingPrompt?: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  selectedKnowledgeBase?: string;
}

export function PromptArea({ onSubmit, isLoading, onImprovePrompt, isImprovingPrompt, prompt, onPromptChange, selectedKnowledgeBase }: PromptAreaProps) {
  const [companyVoice, setCompanyVoice] = useState<'ignite-it' | 'ignite-action'>('ignite-it');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isLoading) {
      await onSubmit(prompt, attachedFiles.length > 0 ? attachedFiles : undefined);
      setAttachedFiles([]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-upload-url`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          knowledgeBaseId: selectedKnowledgeBase,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, key } = await response.json();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setAttachedFiles([...attachedFiles, {
        name: file.name,
        s3Key: key,
        size: file.size,
      }]);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(attachedFiles.filter((_, i) => i !== index));
  };

  const handleImprovePrompt = async () => {
    if (prompt.trim() && onImprovePrompt && !isImprovingPrompt && !isLoading) {
      const improvedPrompt = await onImprovePrompt(prompt, companyVoice);
      onPromptChange(improvedPrompt);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="relative">
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Ask a question about your knowledge base... (e.g., What is our cloud migration strategy?)"
          className="w-full min-h-[200px] p-3 border-2 border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-800 placeholder-slate-400 dark:placeholder-slate-500"
          disabled={isLoading || isImprovingPrompt || uploadingFile}
        />
      </div>
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachedFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm">
              <Paperclip className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span className="text-slate-700 dark:text-slate-300">{file.name}</span>
              <span className="text-slate-500 dark:text-slate-500 text-xs">({formatFileSize(file.size)})</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="ml-1 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                disabled={isLoading || uploadingFile}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
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
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.csv,.xlsx,.xls"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isImprovingPrompt || uploadingFile}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors font-medium"
            title="Attach a file (PDF, Word, Text, Excel)"
          >
            {uploadingFile ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Paperclip className="w-4 h-4" />
                Attach
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={isLoading || isImprovingPrompt || uploadingFile || !prompt.trim()}
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
      </div>
    </form>
  );
}
