import { FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { Document } from '../lib/supabase';

interface DocumentListProps {
  documents: Document[];
  selectedId: string | null;
  onSelect: (doc: Document) => void;
  onDelete: (id: string) => void;
}

export function DocumentList({ documents, selectedId, onSelect, onDelete }: DocumentListProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

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

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <FileText className="w-12 h-12 mx-auto mb-3" />
        <p>No documents yet</p>
        <p className="text-sm mt-1">Create your first document above</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          draggable
          onDragStart={(e) => handleDragStart(e, doc)}
          onDragEnd={handleDragEnd}
          className={`group p-3 rounded-lg border-2 cursor-pointer transition-all ${
            selectedId === doc.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300 bg-white'
          } ${draggingId === doc.id ? 'opacity-50' : ''}`}
          onClick={() => onSelect(doc)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <h3 className="font-medium text-slate-800 truncate">{doc.title}</h3>
              </div>
              <p className="text-sm text-slate-500 line-clamp-2">{doc.prompt}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <p className="text-xs text-slate-400">{formatDate(doc.created_at)}</p>
                {doc.used_knowledge_base !== undefined && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    doc.used_knowledge_base
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {doc.used_knowledge_base ? 'RAG' : 'Direct'}
                  </span>
                )}
                {doc.model_name && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 max-w-[120px] truncate" title={doc.model_name}>
                    {doc.model_name}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(doc.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
