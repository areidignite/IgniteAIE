import { Save, FileEdit, Trash2, Download } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface WorkspaceEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
}

export function WorkspaceEditor({ content, onChange, onSave, onClear, isSaving }: WorkspaceEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localContent]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    onChange(newContent);

    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = localContent.slice(0, start) + text + localContent.slice(end);
      setLocalContent(newContent);
      onChange(newContent);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        textarea.focus();
      }, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
  };

  const handleDownload = () => {
    if (!localContent.trim()) return;

    const blob = new Blob([localContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-2 text-slate-700">
          <FileEdit className="w-5 h-5" />
          <span className="font-medium">Create Document</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={!localContent.trim()}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={handleChange}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          placeholder="Start typing or drag and drop content from your documents or generated answers..."
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 leading-relaxed font-mono text-sm overflow-hidden"
          style={{ minHeight: '600px' }}
        />
        {localContent.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 space-y-2">
              <FileEdit className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">Drag & drop documents here</p>
              <p className="text-xs">Or start typing to build your document</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-500 text-right">
        {localContent.length} characters
      </div>
    </div>
  );
}
