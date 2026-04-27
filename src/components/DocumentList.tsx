import { FileText, Trash2, Search, X, Filter, MessageSquareText, ChevronDown, ChevronUp, Copy, Check, Maximize2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Document } from '../lib/supabase';

type FilterMode = 'all' | 'rag' | 'direct';
type SortMode = 'newest' | 'oldest' | 'title';

interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (doc: Document) => void;
  onDelete: (id: string) => void;
  onViewFull: (doc: Document) => void;
}

export function DocumentList({ documents, selectedId, onSelect, onDelete, onViewFull }: DocumentListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  const filteredDocuments = useMemo(() => {
    let results = documents;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      results = results.filter(
        (doc) =>
          doc.title.toLowerCase().includes(q) ||
          doc.content.toLowerCase().includes(q) ||
          doc.prompt.toLowerCase().includes(q)
      );
    }

    if (filterMode === 'rag') {
      results = results.filter((doc) => doc.used_knowledge_base === true);
    } else if (filterMode === 'direct') {
      results = results.filter((doc) => doc.used_knowledge_base === false);
    }

    if (sortMode === 'oldest') {
      results = [...results].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortMode === 'title') {
      results = [...results].sort((a, b) => a.title.localeCompare(b.title));
    }

    return results;
  }, [documents, searchQuery, filterMode, sortMode]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDragStart = (e: React.DragEvent, doc: Document) => {
    e.dataTransfer.setData('text/plain', doc.content);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingId(doc.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
  };

  const handleCopyPrompt = (e: React.MouseEvent, docId: string, prompt: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(prompt);
    setCopiedPromptId(docId);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  const togglePrompt = (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    setExpandedPromptId(expandedPromptId === docId ? null : docId);
  };

  const hasActiveFilters = filterMode !== 'all' || sortMode !== 'newest';

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Responses..."
          className="w-full pl-9 pr-20 py-2 text-sm bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded transition-colors ${
              hasActiveFilters
                ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
            title="Filters & sorting"
          >
            <Filter className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex items-center gap-3 px-1 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Type:</span>
            <div className="flex rounded-md border border-slate-200 dark:border-slate-600 overflow-hidden">
              {(['all', 'rag', 'direct'] as FilterMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    filterMode === mode
                      ? 'bg-blue-600 text-white dark:bg-blue-500'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                >
                  {mode === 'all' ? 'All' : mode === 'rag' ? 'RAG' : 'Direct'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-400">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-xs px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-md text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500">
          <FileText className="w-12 h-12 mx-auto mb-3" />
          <p>No documents yet</p>
          <p className="text-sm mt-1">Create your first document above</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-6 text-slate-400 dark:text-slate-500">
          <Search className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No documents match your search</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterMode('all');
            }}
            className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 mt-1"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {searchQuery.trim() && (
            <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
              {filteredDocuments.length} result{filteredDocuments.length !== 1 ? 's' : ''}
            </p>
          )}
          {filteredDocuments.map((doc) => (
            <div
              key={doc.id}
              draggable
              onDragStart={(e) => handleDragStart(e, doc)}
              onDragEnd={handleDragEnd}
              className={`group p-3 rounded-lg border-2 cursor-pointer transition-all ${
                selectedId === doc.id
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                  : 'border-slate-200 hover:border-slate-300 bg-white dark:border-slate-700 dark:hover:border-slate-600 dark:bg-slate-800'
              } ${draggingId === doc.id ? 'opacity-50' : ''}`}
              onClick={() => onSelect(doc)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                    <h3 className="font-medium text-slate-800 dark:text-slate-100 truncate">{doc.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{doc.content}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-slate-400 dark:text-slate-500">{formatDate(doc.created_at)}</p>
                    {doc.used_knowledge_base !== undefined && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        doc.used_knowledge_base
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {doc.used_knowledge_base ? 'RAG' : 'Direct'}
                      </span>
                    )}
                    {doc.knowledge_base_name && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 max-w-[120px] truncate" title={doc.knowledge_base_name}>
                        {doc.knowledge_base_name}
                      </span>
                    )}
                    {doc.model_name && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 max-w-[120px] truncate" title={doc.model_name}>
                        {doc.model_name}
                      </span>
                    )}
                    {doc.prompt && (
                      <button
                        onClick={(e) => togglePrompt(e, doc.id)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded transition-all ${
                          expandedPromptId === doc.id
                            ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700/60 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                      >
                        <MessageSquareText className="w-3 h-3" />
                        <span>Prompt</span>
                        {expandedPromptId === doc.id ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  {expandedPromptId === doc.id && doc.prompt && (
                    <div
                      className="mt-2 relative rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 overflow-hidden"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-3 py-2 pr-9">
                        <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">
                          {doc.prompt}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleCopyPrompt(e, doc.id, doc.prompt)}
                        className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Copy prompt"
                      >
                        {copiedPromptId === doc.id ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                        )}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewFull(doc);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-all text-blue-600 dark:text-blue-400"
                    title="View full response"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all text-red-600 dark:text-red-400"
                    title="Delete response"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
