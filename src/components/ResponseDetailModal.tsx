import { X, Copy, Check, FileText, MessageSquareText, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Document } from '../lib/supabase';

interface ResponseDetailModalProps {
  doc: Document;
  onClose: () => void;
}

export function ResponseDetailModal({ doc, onClose }: ResponseDetailModalProps) {
  const [copied, setCopied] = useState(false);
  const [copiedSelection, setCopiedSelection] = useState(false);
  const [promptExpanded, setPromptExpanded] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(doc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySelection = async () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      await navigator.clipboard.writeText(selection.toString());
      setCopiedSelection(true);
      setTimeout(() => setCopiedSelection(false), 2000);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const hasSelection = () => {
    const selection = window.getSelection();
    return selection && selection.toString().trim().length > 0;
  };

  const [selectionExists, setSelectionExists] = useState(false);

  useEffect(() => {
    const handleSelectionChange = () => {
      setSelectionExists(hasSelection() ?? false);
    };
    globalThis.document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      globalThis.document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText className="w-5 h-5 text-slate-500 dark:text-slate-400 flex-shrink-0" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">
              {doc.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {selectionExists && (
              <button
                onClick={handleCopySelection}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-lg transition-colors"
              >
                {copiedSelection ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Selection</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleCopyAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy All</span>
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metadata bar */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3 flex-wrap flex-shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatDate(doc.created_at)}
          </span>
          {doc.used_knowledge_base !== undefined && (
            <span
              className={`text-xs px-2 py-0.5 rounded font-medium ${
                document.used_knowledge_base
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
              }`}
            >
              {doc.used_knowledge_base ? 'RAG' : 'Direct'}
            </span>
          )}
          {doc.knowledge_base_name && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {doc.knowledge_base_name}
            </span>
          )}
          {doc.model_name && (
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              {doc.model_name}
            </span>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {/* Prompt section */}
          {doc.prompt && (
            <div className="mb-5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 overflow-hidden">
              <button
                onClick={() => setPromptExpanded(!promptExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageSquareText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Prompt</span>
                </div>
                {promptExpanded ? (
                  <ChevronUp className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                )}
              </button>
              {promptExpanded && (
                <div className="px-4 pb-3 border-t border-blue-200/50 dark:border-blue-800/50 pt-2">
                  <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap leading-relaxed select-text">
                    {doc.prompt}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Response content */}
          <div
            ref={contentRef}
            className="prose prose-sm dark:prose-invert max-w-none select-text
              prose-headings:font-semibold prose-headings:text-slate-900 dark:prose-headings:text-slate-100
              prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h2:pb-1 prose-h2:border-b prose-h2:border-slate-200 dark:prose-h2:border-slate-700
              prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
              prose-h4:text-sm prose-h4:mt-3 prose-h4:mb-1
              prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-p:my-2
              prose-strong:text-slate-900 dark:prose-strong:text-slate-100
              prose-ul:my-2 prose-li:my-0.5
              prose-table:text-sm prose-th:bg-slate-100 dark:prose-th:bg-slate-700 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-slate-800 dark:prose-th:text-slate-200
              prose-td:px-3 prose-td:py-2 prose-td:border-t prose-td:border-slate-200 dark:prose-td:border-slate-700 prose-td:text-slate-700 dark:prose-td:text-slate-300
            "
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between flex-shrink-0 bg-slate-50 dark:bg-slate-800/50">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {doc.content.length.toLocaleString()} characters
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Select text to copy a portion, or use Copy All for the full response
          </p>
        </div>
      </div>
    </div>
  );
}
