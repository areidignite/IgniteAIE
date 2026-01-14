import { useState, useEffect } from 'react';
import { File, FolderOpen, Loader2, CheckSquare, Square, Copy, ChevronRight, Home } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
}

interface FolderItem {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  lastModified?: string;
}

interface RepositoryBrowserProps {
  onError: (error: string) => void;
  selectedKnowledgeBase: string;
  onClose: () => void;
}

export function RepositoryBrowser({ onError, selectedKnowledgeBase, onClose }: RepositoryBrowserProps) {
  const [allFiles, setAllFiles] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [copying, setCopying] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');

  useEffect(() => {
    loadRepositoryFiles();
  }, []);

  const loadRepositoryFiles = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-repository-files`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load repository files');
      }

      const data = await response.json();
      const fileObjects = (data.Contents || []).filter((obj: S3Object) =>
        obj.Size > 0
      );
      setAllFiles(fileObjects);
    } catch (err) {
      console.error('Error loading repository files:', err);
      onError(err instanceof Error ? err.message : 'Failed to load repository files');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentFolderItems = (): FolderItem[] => {
    const items = new Map<string, FolderItem>();
    const prefix = currentPath ? `${currentPath}/` : '';

    allFiles.forEach(file => {
      if (!file.Key.startsWith(prefix)) return;

      const relativePath = file.Key.substring(prefix.length);
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1) {
        items.set(file.Key, {
          name: relativePath,
          path: file.Key,
          isFolder: false,
          size: file.Size,
          lastModified: file.LastModified,
        });
      } else {
        const folderName = relativePath.substring(0, slashIndex);
        const folderPath = prefix + folderName;
        if (!items.has(folderPath)) {
          items.set(folderPath, {
            name: folderName,
            path: folderPath,
            isFolder: true,
          });
        }
      }
    });

    return Array.from(items.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const items = getCurrentFolderItems();
  const visibleFiles = items.filter(item => !item.isFolder);

  const toggleFileSelection = (fileKey: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fileKey)) {
        newSet.delete(fileKey);
      } else {
        newSet.add(fileKey);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const filePaths = visibleFiles.map(f => f.path);
    if (filePaths.every(path => selectedFiles.has(path))) {
      const newSet = new Set(selectedFiles);
      filePaths.forEach(path => newSet.delete(path));
      setSelectedFiles(newSet);
    } else {
      const newSet = new Set(selectedFiles);
      filePaths.forEach(path => newSet.add(path));
      setSelectedFiles(newSet);
    }
  };

  const handleItemClick = (item: FolderItem) => {
    if (item.isFolder) {
      setCurrentPath(item.path);
    } else {
      toggleFileSelection(item.path);
    }
  };

  const navigateToPath = (path: string) => {
    setCurrentPath(path);
  };

  const getPathSegments = () => {
    if (!currentPath) return [];
    return currentPath.split('/');
  };

  const handleCopyFiles = async () => {
    if (selectedFiles.size === 0) {
      onError('Please select at least one file to copy');
      return;
    }

    if (!selectedKnowledgeBase) {
      onError('Please select a knowledge base first');
      return;
    }

    setCopying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copy-repository-files`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileKeys: Array.from(selectedFiles),
          knowledgeBaseId: selectedKnowledgeBase,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to copy files');
      }

      const result = await response.json();

      if (result.failureCount > 0) {
        onError(`Copied ${result.successCount} file(s) successfully, ${result.failureCount} failed`);
      } else {
        alert(`Successfully copied ${result.successCount} file(s) to the knowledge base!`);
      }

      setSelectedFiles(new Set());
      onClose();
    } catch (err) {
      console.error('Error copying files:', err);
      onError(err instanceof Error ? err.message : 'Failed to copy files');
    } finally {
      setCopying(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Copy from Repository</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Select files to copy to your knowledge base
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="ml-3 text-slate-600 dark:text-slate-400">Loading repository files...</span>
            </div>
          ) : allFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500">
              <FolderOpen className="w-16 h-16 mb-4" />
              <p className="text-lg">No files found in repository</p>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 overflow-x-auto pb-2">
                <button
                  onClick={() => navigateToPath('')}
                  className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex-shrink-0"
                  title="Go to root"
                >
                  <Home className="w-4 h-4" />
                </button>
                {getPathSegments().map((segment, index) => {
                  const path = getPathSegments().slice(0, index + 1).join('/');
                  return (
                    <div key={path} className="flex items-center gap-1 flex-shrink-0">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                      <button
                        onClick={() => navigateToPath(path)}
                        className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                      >
                        {segment}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mb-4 flex items-center justify-between">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  {visibleFiles.length > 0 && visibleFiles.every(f => selectedFiles.has(f.path)) ? (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      Deselect All Files
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4" />
                      Select All Files
                    </>
                  )}
                </button>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
                </span>
              </div>

              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                    <FolderOpen className="w-12 h-12 mb-3" />
                    <p>Empty folder</p>
                  </div>
                ) : (
                  items.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => handleItemClick(item)}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        !item.isFolder && selectedFiles.has(item.path)
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      {!item.isFolder && (
                        <div className="flex-shrink-0">
                          {selectedFiles.has(item.path) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                          )}
                        </div>
                      )}
                      {item.isFolder ? (
                        <FolderOpen className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0" />
                      ) : (
                        <File className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {item.name}
                        </p>
                        {!item.isFolder && item.size !== undefined && item.lastModified && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {formatFileSize(item.size)} • {formatDate(item.lastModified)}
                          </p>
                        )}
                        {item.isFolder && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Folder
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleCopyFiles}
            disabled={selectedFiles.size === 0 || copying || !selectedKnowledgeBase}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {copying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Copying...
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copy {selectedFiles.size > 0 ? `${selectedFiles.size} File${selectedFiles.size > 1 ? 's' : ''}` : 'Files'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
