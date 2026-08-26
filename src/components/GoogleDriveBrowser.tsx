import { useState, useEffect, useCallback, useRef } from 'react';
import { File, FolderOpen, Loader2, CheckSquare, Square, Copy, ChevronRight, Home, X, LogIn } from 'lucide-react';
import { getValidSession } from '../lib/supabase';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

interface GoogleDriveBrowserProps {
  onError: (error: string) => void;
  selectedKnowledgeBase: string;
  onClose: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

export function GoogleDriveBrowser({ onError, selectedKnowledgeBase, onClose }: GoogleDriveBrowserProps) {
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Map<string, { name: string; mimeType: string }>>(new Map());
  const [copying, setCopying] = useState(false);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  const currentFolderId = folderStack[folderStack.length - 1].id;

  const initializeGoogleAuth = useCallback(() => {
    if (!window.google) {
      onError('Google sign-in is still loading. Please try again in a moment.');
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      onError('Google Client ID is not configured.');
      return;
    }

    setAuthenticating(true);

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (response) => {
        setAuthenticating(false);
        if (response.error) {
          onError(`Google sign-in failed: ${response.error}`);
          return;
        }
        if (response.access_token) {
          setGoogleToken(response.access_token);
        }
      },
    });

    tokenClientRef.current = tokenClient;
    tokenClient.requestAccessToken();
  }, [onError]);

  useEffect(() => {
    if (googleToken) {
      loadFiles(currentFolderId, true);
    }
  }, [googleToken, currentFolderId]);

  const loadFiles = async (folderId: string, reset = false) => {
    if (!googleToken) return;

    setLoading(true);
    try {
      const session = await getValidSession();
      if (!session) throw new Error('No active session');

      const params = new URLSearchParams({ folderId });
      if (!reset && nextPageToken) params.append('pageToken', nextPageToken);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-google-drive-files?${params.toString()}`;

      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'X-Google-Access-Token': googleToken,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.code === 'TOKEN_EXPIRED') {
          setGoogleToken(null);
          onError('Your Google session expired. Please sign in again.');
          return;
        }
        throw new Error(error.error || 'Failed to load Google Drive files');
      }

      const data = await response.json();

      if (reset) {
        setFiles(data.files || []);
      } else {
        setFiles(prev => [...prev, ...(data.files || [])]);
      }
      setNextPageToken(data.nextPageToken || null);
    } catch (err) {
      console.error('Error loading Google Drive files:', err);
      onError(err instanceof Error ? err.message : 'Failed to load Google Drive files');
    } finally {
      setLoading(false);
    }
  };

  const isFolder = (file: DriveFile) => file.mimeType === 'application/vnd.google-apps.folder';

  const navigateToFolder = (file: DriveFile) => {
    setFolderStack(prev => [...prev, { id: file.id, name: file.name }]);
    setNextPageToken(null);
  };

  const navigateToIndex = (index: number) => {
    setFolderStack(prev => prev.slice(0, index + 1));
    setNextPageToken(null);
  };

  const toggleFileSelection = (file: DriveFile) => {
    if (isFolder(file)) {
      navigateToFolder(file);
      return;
    }

    setSelectedFiles(prev => {
      const newMap = new Map(prev);
      if (newMap.has(file.id)) {
        newMap.delete(file.id);
      } else {
        newMap.set(file.id, { name: file.name, mimeType: file.mimeType });
      }
      return newMap;
    });
  };

  const toggleSelectAll = () => {
    const selectableFiles = files.filter(f => !isFolder(f));
    const allSelected = selectableFiles.every(f => selectedFiles.has(f.id));

    setSelectedFiles(prev => {
      const newMap = new Map(prev);
      if (allSelected) {
        selectableFiles.forEach(f => newMap.delete(f.id));
      } else {
        selectableFiles.forEach(f => newMap.set(f.id, { name: f.name, mimeType: f.mimeType }));
      }
      return newMap;
    });
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

    if (!googleToken) {
      onError('Google session expired. Please sign in again.');
      return;
    }

    setCopying(true);
    try {
      const session = await getValidSession();
      if (!session) throw new Error('No active session');

      const fileIds = Array.from(selectedFiles.keys());
      const fileNames = fileIds.map(id => selectedFiles.get(id)!.name);
      const fileMimeTypes = fileIds.map(id => selectedFiles.get(id)!.mimeType);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copy-google-drive-files`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'X-Google-Access-Token': googleToken,
        },
        body: JSON.stringify({
          fileIds,
          fileNames,
          fileMimeTypes,
          knowledgeBaseId: selectedKnowledgeBase,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to copy files');
      }

      const result = await response.json();

      if (result.failureCount > 0) {
        onError(`Copied ${result.successCount} file(s) successfully, ${result.failureCount} failed.`);
      } else {
        alert(`Successfully copied ${result.successCount} file(s) from Google Drive to the knowledge base!`);
      }

      setSelectedFiles(new Map());
      onClose();
    } catch (err) {
      console.error('Error copying files:', err);
      onError(err instanceof Error ? err.message : 'Failed to copy files');
    } finally {
      setCopying(false);
    }
  };

  const formatSize = (bytes: string | undefined) => {
    if (!bytes) return '';
    const num = parseInt(bytes, 10);
    if (num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return Math.round((num / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString();
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') {
      return <FolderOpen className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0" />;
    }
    return <File className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />;
  };

  const getFileTypeLabel = (mimeType: string) => {
    switch (mimeType) {
      case 'application/vnd.google-apps.document': return 'Google Doc';
      case 'application/vnd.google-apps.spreadsheet': return 'Google Sheet';
      case 'application/vnd.google-apps.presentation': return 'Google Slides';
      case 'application/vnd.google-apps.folder': return 'Folder';
      case 'application/pdf': return 'PDF';
      default: {
        const parts = mimeType.split('/');
        return parts[1]?.substring(0, 20) || 'File';
      }
    }
  };

  const selectableFiles = files.filter(f => !isFolder(f));
  const allSelected = selectableFiles.length > 0 && selectableFiles.every(f => selectedFiles.has(f.id));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Copy from Google Drive</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {googleToken ? 'Select files to copy to your knowledge base' : 'Sign in with Google to browse your Drive files'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {!googleToken ? (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                <LogIn className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                Connect to Google Drive
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-md mb-6">
                Sign in with your Google account to browse and copy files from your Drive to the knowledge base.
              </p>
              <button
                onClick={initializeGoogleAuth}
                disabled={authenticating}
                className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-sm disabled:opacity-50"
              >
                {authenticating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                ) : (
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                )}
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {authenticating ? 'Signing in...' : 'Sign in with Google'}
                </span>
              </button>
            </div>
          ) : loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
              <span className="ml-3 text-slate-600 dark:text-slate-400">Loading Google Drive files...</span>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 overflow-x-auto pb-2">
                {folderStack.map((folder, index) => (
                  <div key={`${folder.id}-${index}`} className="flex items-center gap-1 flex-shrink-0">
                    {index > 0 && <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <button
                      onClick={() => navigateToIndex(index)}
                      className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
                    >
                      {index === 0 && <Home className="w-4 h-4" />}
                      {folder.name}
                    </button>
                  </div>
                ))}
              </div>

              {selectableFiles.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    {allSelected ? (
                      <>
                        <CheckSquare className="w-4 h-4" />
                        Deselect All
                      </>
                    ) : (
                      <>
                        <Square className="w-4 h-4" />
                        Select All
                      </>
                    )}
                  </button>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {files.length === 0 && !loading ? (
                  <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
                    <FolderOpen className="w-12 h-12 mb-3" />
                    <p>This folder is empty</p>
                  </div>
                ) : (
                  files.map((file) => {
                    const folder = isFolder(file);
                    const isSelected = !folder && selectedFiles.has(file.id);

                    return (
                      <div
                        key={file.id}
                        onClick={() => toggleFileSelection(file)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        {!folder && (
                          <div className="flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400 dark:text-slate-500" />
                            )}
                          </div>
                        )}
                        {getFileIcon(file.mimeType)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {getFileTypeLabel(file.mimeType)}
                            {file.size && ` \u2022 ${formatSize(file.size)}`}
                            {file.modifiedTime && ` \u2022 ${formatDate(file.modifiedTime)}`}
                          </p>
                        </div>
                        {folder && (
                          <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {nextPageToken && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => loadFiles(currentFolderId, false)}
                    disabled={loading}
                    className="px-6 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
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
          {googleToken && (
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
          )}
        </div>
      </div>
    </div>
  );
}
