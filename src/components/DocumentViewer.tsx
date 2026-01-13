import { FileText, Copy, Check, BookOpen, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
          const { data: { session } } = await supabase.auth.getSession();
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
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
        <FileText className="w-16 h-16" />
        <p className="text-lg">Your generated document will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2 text-slate-600">
          <FileText className="w-5 h-5" />
          <span className="font-medium">Generated Document</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
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
        <div className="mb-3 p-2.5 bg-blue-50 border-l-4 border-blue-500 rounded">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <p className="text-sm text-blue-700 font-medium">Prompt:</p>
              <div className="flex items-center gap-2">
                {usedKnowledgeBase !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    usedKnowledgeBase
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {usedKnowledgeBase ? 'RAG' : 'Direct'}
                  </span>
                )}
                {modelName && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-200 text-blue-800 max-w-[150px] truncate" title={modelName}>
                    {modelName}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setPromptCollapsed(!promptCollapsed)}
              className="text-blue-700 hover:text-blue-900 transition-colors flex-shrink-0"
              title={promptCollapsed ? "Expand prompt" : "Collapse prompt"}
            >
              {promptCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
          {!promptCollapsed && (
            <p className="text-sm text-blue-600 mt-2">{prompt}</p>
          )}
        </div>
      )}

      <div>
        <div className="prose prose-slate max-w-none">
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, content)}
            onDragEnd={handleDragEnd}
            className={`whitespace-pre-wrap text-slate-800 leading-relaxed cursor-move select-text ${
              dragging ? 'opacity-50' : ''
            } hover:bg-blue-50 rounded p-2 transition-colors`}
          >
            {content}
          </div>
        </div>

        {citations.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-slate-700 font-medium mb-3">
              <BookOpen className="w-5 h-5" />
              <span>Citations</span>
            </div>
            <div className="space-y-2">
              {citations.map((citation, index) => {
                const s3Uri = citation.location?.s3Location?.uri;
                const webUrl = citation.location?.webLocation?.url;
                const presignedUrl = s3Uri ? presignedUrls[s3Uri] : null;
                const isLoadingUrl = s3Uri ? loadingUrls.has(s3Uri) : false;

                return (
                  <div
                    key={index}
                    className="p-3 bg-amber-50 border-l-4 border-amber-400 rounded text-sm"
                  >
                    <p className="text-amber-900 mb-2">{citation.text}</p>

                    {s3Uri && (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-slate-600 font-mono break-all">
                          Source: {s3Uri}
                        </p>
                        {isLoadingUrl && (
                          <p className="text-xs text-slate-500">Loading download link...</p>
                        )}
                        {presignedUrl && (
                          <a
                            href={presignedUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Download/View File</span>
                          </a>
                        )}
                      </div>
                    )}

                    {webUrl && (
                      <div className="mt-2">
                        <a
                          href={webUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span className="truncate max-w-xs" title={webUrl}>
                            {webUrl}
                          </span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
