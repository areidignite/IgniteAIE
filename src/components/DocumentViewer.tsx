import { FileText, Copy, Check, Link2, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase, getValidSession } from '../lib/supabase';

interface DocumentViewerProps {
  content: string;
  prompt: string;
  citations?: Array<{ text: string; location?: any }>;
  usedKnowledgeBase?: boolean;
  modelName?: string;
}

export function DocumentViewer({ content, prompt, citations = [], usedKnowledgeBase, modelName }: DocumentViewerProps) {
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [presignedUrls, setPresignedUrls] = useState<Record<string, string>>({});
  const [loadingUrls, setLoadingUrls] = useState<Set<string>>(new Set());
  const [promptCollapsed, setPromptCollapsed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDragStart = (e: React.DragEvent, text: string) => {
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
    setDragging(true);
  };

  const handleDragEnd = () => {
    setDragging(false);
  };

  useEffect(() => {
    const fetchPresignedUrls = async () => {
      const s3Citations = citations.filter(c => c.location?.s3Location?.uri);

      for (const citation of s3Citations) {
        const s3Uri = citation.location.s3Location.uri;
        if (presignedUrls[s3Uri] || loadingUrls.has(s3Uri)) continue;

        setLoadingUrls(prev => new Set(prev).add(s3Uri));

        try {
          const session = await getValidSession();
          if (!session) return;

          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-presigned-url`;
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ s3Uri, expiresIn: 3600 }),
          });

          if (response.ok) {
            const { presignedUrl } = await response.json();
            setPresignedUrls(prev => ({ ...prev, [s3Uri]: presignedUrl }));
          }
        } catch (error) {
          console.error('Error fetching presigned URL:', error);
        } finally {
          setLoadingUrls(prev => {
            const next = new Set(prev);
            next.delete(s3Uri);
            return next;
          });
        }
      }
    };

    fetchPresignedUrls();
  }, [citations]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-4">
        <FileText className="w-16 h-16" />
        <p className="text-lg">Your generated document will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <FileText className="w-5 h-5" />
          <span className="font-medium">Generated Document</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              Copy
            </>
          )}
        </button>
      </div>

      {prompt && (
        <div className="mb-3 p-2.5 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-600 rounded">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Prompt:</p>
              <div className="flex items-center gap-2">
                {usedKnowledgeBase !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    usedKnowledgeBase
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    {usedKnowledgeBase ? 'RAG' : 'Direct'}
                  </span>
                )}
                {modelName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 max-w-[150px] truncate" title={modelName}>
                    {modelName}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setPromptCollapsed(!promptCollapsed)}
              className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 transition-colors flex-shrink-0"
              title={promptCollapsed ? "Expand prompt" : "Collapse prompt"}
            >
              {promptCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
          {!promptCollapsed && (
            <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">{prompt}</p>
          )}
        </div>
      )}

      <div>
        <div className="prose prose-slate max-w-none">
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, content)}
            onDragEnd={handleDragEnd}
            className={`whitespace-pre-wrap text-slate-800 dark:text-slate-200 leading-relaxed cursor-move select-text ${
              dragging ? 'opacity-50' : ''
            } hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded p-2 transition-colors`}
          >
            {content}
          </div>
        </div>

        {citations.length > 0 && (() => {
          const uniqueLinks = new Map<string, { uri: string; filename: string; type: 's3' | 'web' }>();
          for (const citation of citations) {
            const s3Uri = citation.location?.s3Location?.uri;
            const webUrl = citation.location?.webLocation?.url;
            if (s3Uri && !uniqueLinks.has(s3Uri)) {
              const parts = s3Uri.split('/');
              uniqueLinks.set(s3Uri, {
                uri: s3Uri,
                filename: decodeURIComponent(parts[parts.length - 1] || s3Uri),
                type: 's3',
              });
            }
            if (webUrl && !uniqueLinks.has(webUrl)) {
              uniqueLinks.set(webUrl, { uri: webUrl, filename: webUrl, type: 'web' });
            }
          }
          const links = Array.from(uniqueLinks.values());
          if (links.length === 0) return null;

          return (
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-3">
                <Link2 className="w-5 h-5" />
                <span>Document Links</span>
              </div>
              <div className="space-y-2">
                {links.map((link) => {
                  const presignedUrl = link.type === 's3' ? presignedUrls[link.uri] : null;
                  const isLoadingUrl = link.type === 's3' ? loadingUrls.has(link.uri) : false;

                  return (
                    <div
                      key={link.uri}
                      className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg"
                    >
                      <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate flex-1" title={link.filename}>
                        {link.filename}
                      </span>
                      {link.type === 's3' && isLoadingUrl && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0">Loading...</span>
                      )}
                      {link.type === 's3' && presignedUrl && (
                        <a
                          href={presignedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      )}
                      {link.type === 'web' && (
                        <a
                          href={link.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline flex-shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
