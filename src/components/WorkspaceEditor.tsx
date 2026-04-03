import { File as FileEdit, Trash2, Download, ChevronDown, FileText, FileType } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { exportToDocx, exportToPdf, exportToTxt } from '../lib/exportDocument';
import { RichTextEditor } from './RichTextEditor';

interface WorkspaceEditorProps {
  content: string;
  onChange: (content: string) => void;
  onClear: () => void;
}

export function WorkspaceEditor({ content, onChange, onClear }: WorkspaceEditorProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState(content);

  useEffect(() => {
    setHtmlContent(content);
  }, [content]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEditorChange = (html: string) => {
    setHtmlContent(html);
    onChange(html);
  };

  const isContentEmpty = () => {
    const stripped = htmlContent.replace(/<[^>]*>/g, '').trim();
    return stripped.length === 0;
  };

  const handleExport = async (format: 'docx' | 'pdf' | 'txt') => {
    if (isContentEmpty()) return;
    setExporting(true);
    setShowExportMenu(false);
    try {
      if (format === 'docx') {
        await exportToDocx(htmlContent);
      } else if (format === 'pdf') {
        await exportToPdf(htmlContent);
      } else {
        await exportToTxt(htmlContent);
      }
    } finally {
      setExporting(false);
    }
  };

  const charCount = htmlContent.replace(/<[^>]*>/g, '').length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <FileEdit className="w-5 h-5" />
          <span className="font-medium">Create Document</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isContentEmpty() || exporting}
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
                    <div className="text-xs text-slate-400 dark:text-slate-500">Export as PDF</div>
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
        </div>
      </div>

      <div className="flex-1">
        <RichTextEditor
          content={htmlContent}
          onChange={handleEditorChange}
          placeholder="Start typing or drag and drop content from your documents or generated answers..."
        />
      </div>

      <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-right">
        {charCount} characters
      </div>
    </div>
  );
}
