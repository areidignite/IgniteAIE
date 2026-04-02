import { Save, File as FileEdit, Trash2, Download, ChevronDown, FileText, FileType } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { exportToDocx, exportToPdf, exportToTxt } from '../lib/exportDocument';

interface WorkspaceEditorProps {
  content: string;
  onChange: (content: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
}

export function WorkspaceEditor({ content, onChange, onSave, onClear, isSaving }: WorkspaceEditorProps) {
  const [localContent, setLocalContent] = useState(content);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalContent(content);
  }, [content]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [localContent]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleExport = async (format: 'docx' | 'pdf' | 'txt') => {
    if (!localContent.trim()) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      if (format === 'docx') {
        await exportToDocx(localContent);
      } else if (format === 'pdf') {
        exportToPdf(localContent);
      } else {
        exportToTxt(localContent);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <FileEdit className="w-5 h-5" />
          <span className="font-medium">Create Document</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!localContent.trim() || exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 disabled:bg-green-300 dark:disabled:bg-green-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 py-1 z-50">
                <button
                  onClick={() => handleExport('docx')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  <FileType className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <div className="text-left">
                    <div className="font-medium">Word (.docx)</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">Microsoft Word format</div>
                  </div>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  <FileText className="w-4 h-4 text-red-600 dark:text-red-400" />
                  <div className="text-left">
                    <div className="font-medium">PDF (.pdf)</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">Print to PDF</div>
                  </div>
                </button>
                <div className="border-t border-slate-200 dark:border-slate-600 my-1" />
                <button
                  onClick={() => handleExport('txt')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  <FileEdit className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <div className="text-left">
                    <div className="font-medium">Plain Text (.txt)</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">Simple text file</div>
                  </div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={onClear}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </button>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:bg-blue-400 dark:disabled:bg-blue-800 text-white rounded-lg transition-colors"
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
          className="w-full p-4 bg-slate-50 border border-slate-200 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-800 leading-relaxed font-mono text-sm overflow-hidden"
          style={{ minHeight: '600px' }}
        />
        {localContent.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 dark:text-slate-500 space-y-2">
              <FileEdit className="w-12 h-12 mx-auto opacity-30" />
              <p className="text-sm">Drag & drop documents here</p>
              <p className="text-xs">Or start typing to build your document</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-right">
        {localContent.length} characters
      </div>
    </div>
  );
}
