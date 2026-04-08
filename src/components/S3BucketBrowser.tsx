import { FolderOpen, FolderPlus, File, Download, RefreshCw, Upload, Trash2, RefreshCcw, X, Copy, ChevronRight, Home, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase, getValidSession } from '../lib/supabase';
import { RepositoryBrowser } from './RepositoryBrowser';

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
  ETag: string;
}

interface FolderItem {
  name: string;
  path: string;
  isFolder: boolean;
  size?: number;
  lastModified?: string;
}

interface S3BucketBrowserProps {
  onError: (message: string) => void;
  selectedKnowledgeBase: string;
}

export function S3BucketBrowser({ onError, selectedKnowledgeBase }: S3BucketBrowserProps) {

  const [allObjects, setAllObjects] = useState<S3Object[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [continuationToken, setContinuationToken] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string>('');
  const [showRepositoryBrowser, setShowRepositoryBrowser] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const statusCheckIntervalRef = useRef<number | null>(null);

  const fetchObjects = async (resetList = false) => {
    setLoading(true);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-s3-objects`;
      const params = new URLSearchParams();
      if (!resetList && continuationToken) params.append('continuationToken', continuationToken);
      if (selectedKnowledgeBase) params.append('knowledgeBaseId', selectedKnowledgeBase);

      const response = await fetch(`${apiUrl}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Full error response:', error);
        throw new Error(error.message || error.error || 'Failed to fetch S3 objects');
      }

      const data = await response.json();

      if (resetList) {
        setAllObjects(data.Contents || []);
      } else {
        setAllObjects(prev => [...prev, ...(data.Contents || [])]);
      }

      setHasMore(data.IsTruncated || false);
      setContinuationToken(data.NextContinuationToken);
    } catch (error) {
      console.error('Error fetching S3 objects:', error);
      onError(error instanceof Error ? error.message : 'Failed to fetch S3 objects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedKnowledgeBase) {
      fetchObjects(true);
    } else {
      setAllObjects([]);
    }
  }, [selectedKnowledgeBase]);

  const getCurrentFolderItems = (): FolderItem[] => {
    const items = new Map<string, FolderItem>();
    const prefix = currentPath ? `${currentPath}/` : '';

    allObjects.forEach(obj => {
      if (!obj.Key.startsWith(prefix)) return;

      const relativePath = obj.Key.substring(prefix.length);
      const slashIndex = relativePath.indexOf('/');

      if (slashIndex === -1 && relativePath && relativePath !== '.folder') {
        items.set(obj.Key, {
          name: relativePath,
          path: obj.Key,
          isFolder: false,
          size: obj.Size,
          lastModified: obj.LastModified,
        });
      } else if (slashIndex > 0) {
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

  const getFilesInFolder = (folderPath: string): S3Object[] => {
    const prefix = `${folderPath}/`;
    return allObjects.filter(obj => obj.Key.startsWith(prefix));
  };

  const navigateToPath = (path: string) => {
    setCurrentPath(path);
  };

  const getPathSegments = () => {
    if (!currentPath) return [];
    return currentPath.split('/');
  };

  const handleItemClick = (item: FolderItem) => {
    if (item.isFolder) {
      setCurrentPath(item.path);
    }
  };

  const items = filterText
    ? getCurrentFolderItems().filter(item =>
        item.name.toLowerCase().includes(filterText.toLowerCase())
      )
    : getCurrentFolderItems();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownload = async (key: string) => {
    setLoadingUrl(key);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generated-presigned-url`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          knowledgeBaseId: selectedKnowledgeBase
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate presigned URL');
      }

      const data = await response.json();

      window.open(data.url, '_blank');
    } catch (error) {
      console.error('Error generating presigned URL:', error);
      onError(error instanceof Error ? error.message : 'Failed to generate download URL');
    } finally {
      setLoadingUrl(null);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;
    let failedFiles: string[] = [];

    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      for (const file of fileArray) {
        try {
          const key = file.name;

          const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-upload-url`;

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              key,
              contentType: file.type || 'application/octet-stream',
              knowledgeBaseId: selectedKnowledgeBase
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || error.message || 'Failed to generate upload URL');
          }

          const data = await response.json();

          const uploadResponse = await fetch(data.url, {
            method: 'PUT',
            body: file,
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
          });

          if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(`Failed to upload file to S3: ${uploadResponse.status} ${errorText}`);
          }

          successCount++;
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          failedFiles.push(file.name);
        }
      }

      await fetchObjects(true);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (failedFiles.length > 0) {
        onError(`Successfully uploaded ${successCount} file(s). Failed to upload: ${failedFiles.join(', ')}`);
      }
    } catch (error) {
      console.error('Error during file upload:', error);
      onError(error instanceof Error ? error.message : 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (key: string) => {
    const fileName = key.split('/').pop() || key;
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    setDeletingKey(key);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-s3-object`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          knowledgeBaseId: selectedKnowledgeBase
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 403) {
          throw new Error('Permission denied: AWS credentials do not have s3:DeleteObject permission. Please update your IAM policy.');
        }
        throw new Error(error.error || 'Failed to delete file');
      }

      await fetchObjects(true);
    } catch (error) {
      console.error('Error deleting file:', error);
      onError(error instanceof Error ? error.message : 'Failed to delete file');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    if (/[/\\#%&{}<>*?$!'":@+`|=]/.test(trimmed)) {
      onError('Folder name contains invalid characters');
      return;
    }

    const existingItems = getCurrentFolderItems();
    if (existingItems.some(item => item.name === trimmed)) {
      onError('A file or folder with that name already exists');
      return;
    }

    setCreatingFolder(true);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const folderKey = currentPath
        ? `${currentPath}/${trimmed}/.folder`
        : `${trimmed}/.folder`;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-upload-url`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: folderKey,
          contentType: 'application/x-directory',
          knowledgeBaseId: selectedKnowledgeBase,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to create folder');
      }

      const data = await response.json();

      const uploadResponse = await fetch(data.url, {
        method: 'PUT',
        body: new Blob([], { type: 'application/x-directory' }),
        headers: {
          'Content-Type': 'application/x-directory',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to create folder in S3');
      }

      setNewFolderName('');
      setShowNewFolderInput(false);
      await fetchObjects(true);
    } catch (error) {
      console.error('Error creating folder:', error);
      onError(error instanceof Error ? error.message : 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const checkIngestionStatus = async (
    knowledgeBaseId: string,
    dataSourceId: string,
    ingestionJobId: string
  ) => {
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-ingestion-status`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ knowledgeBaseId, dataSourceId, ingestionJobId }),
      });

      if (!response.ok) {
        throw new Error('Failed to check ingestion status');
      }

      const data = await response.json();
      const status = data.ingestionJob?.status;

      setSyncStatus(`Sync status: ${status || 'UNKNOWN'}`);

      if (status === 'COMPLETE') {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
        setSyncing(false);
        setSyncStatus('Sync completed successfully!');
        setTimeout(() => setSyncStatus(''), 5000);
      } else if (status === 'FAILED') {
        if (statusCheckIntervalRef.current) {
          clearInterval(statusCheckIntervalRef.current);
          statusCheckIntervalRef.current = null;
        }
        setSyncing(false);
        setSyncStatus('Sync failed');
        setTimeout(() => setSyncStatus(''), 5000);
      }
    } catch (error) {
      console.error('Error checking ingestion status:', error);
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
        statusCheckIntervalRef.current = null;
      }
      setSyncing(false);
      setSyncStatus('');
    }
  };

  const handleStopSync = () => {
    if (statusCheckIntervalRef.current) {
      clearInterval(statusCheckIntervalRef.current);
      statusCheckIntervalRef.current = null;
    }
    setSyncing(false);
    setSyncStatus('Sync cancelled');
    setTimeout(() => setSyncStatus(''), 3000);
  };

  const handleSync = async () => {
    if (!selectedKnowledgeBase) {
      onError('Please select a knowledge base to sync');
      return;
    }

    setSyncing(true);
    setSyncStatus('Starting sync...');
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-knowledge-base`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          knowledgeBaseId: selectedKnowledgeBase
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Sync error details:', error);
        const errorMessage = error.hint
          ? `${error.error}: ${error.hint}`
          : error.details || error.error || 'Failed to sync knowledge base';
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const ingestionJobId = data.ingestionJob?.ingestionJobId;
      const dataSourceId = data.dataSourceId;

      if (ingestionJobId && dataSourceId) {
        setSyncStatus('Sync in progress...');

        statusCheckIntervalRef.current = window.setInterval(() => {
          checkIngestionStatus(selectedKnowledgeBase, dataSourceId, ingestionJobId);
        }, 3000);
      } else {
        setSyncing(false);
        setSyncStatus('Sync started but unable to track status');
        setTimeout(() => setSyncStatus(''), 5000);
      }
    } catch (error) {
      console.error('Error syncing knowledge base:', error);
      onError(error instanceof Error ? error.message : 'Failed to sync knowledge base');
      setSyncing(false);
      setSyncStatus('');
    }
  };

  useEffect(() => {
    return () => {
      if (statusCheckIntervalRef.current) {
        clearInterval(statusCheckIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => fetchObjects(true)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-emerald-600 dark:bg-emerald-500 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
          <button
            onClick={() => {
              setShowNewFolderInput(true);
              setTimeout(() => folderInputRef.current?.focus(), 50);
            }}
            disabled={creatingFolder}
            className="px-4 py-2 bg-sky-600 dark:bg-sky-500 text-white rounded-lg hover:bg-sky-700 dark:hover:bg-sky-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <FolderPlus className="w-4 h-4" />
            New Folder
          </button>
          <button
            onClick={() => setShowRepositoryBrowser(true)}
            disabled={!selectedKnowledgeBase}
            className="px-4 py-2 bg-violet-600 dark:bg-violet-500 text-white rounded-lg hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
            title={!selectedKnowledgeBase ? 'Select a knowledge base first' : 'Copy files from repository'}
          >
            <Copy className="w-4 h-4" />
            Copy from Repository
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || !selectedKnowledgeBase}
              className="px-4 py-2 bg-amber-600 dark:bg-amber-500 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-600 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              title={!selectedKnowledgeBase ? 'Select a knowledge base first' : 'Sync S3 bucket with knowledge base'}
            >
              {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Sync KB
            </button>
            {syncing && (
              <button
                onClick={handleStopSync}
                className="px-3 py-2 bg-red-600 dark:bg-red-500 text-white rounded-lg hover:bg-red-700 dark:hover:bg-red-600 transition-colors inline-flex items-center gap-1.5"
                title="Stop sync"
              >
                <X className="w-4 h-4" />
                Stop
              </button>
            )}
            {syncStatus && (
              <span className={`text-sm ${syncing ? 'text-amber-600 dark:text-amber-400' : syncStatus.includes('failed') || syncStatus.includes('cancelled') ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {syncStatus}
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search files..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className={`w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${filterText ? 'pr-20' : ''}`}
          />
          {filterText && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-700 px-1">
              {items.length} of {allObjects.length}
            </div>
          )}
        </div>
      </div>

      {!filterText && (
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
      )}

      {showNewFolderInput && (
        <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/20">
          <FolderPlus className="w-5 h-5 text-sky-500 dark:text-sky-400 flex-shrink-0" />
          <input
            ref={folderInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }
            }}
            placeholder="Folder name"
            disabled={creatingFolder}
            className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            onClick={handleCreateFolder}
            disabled={creatingFolder || !newFolderName.trim()}
            className="px-3 py-1.5 bg-sky-600 dark:bg-sky-500 text-white rounded-lg hover:bg-sky-700 dark:hover:bg-sky-600 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 text-sm"
          >
            {creatingFolder ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Create
          </button>
          <button
            onClick={() => {
              setShowNewFolderInput(false);
              setNewFolderName('');
            }}
            disabled={creatingFolder}
            className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {items.length === 0 && !loading ? (
        <div className="text-center py-8 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" />
          <p>{filterText ? 'No files match your search' : currentPath ? 'Empty folder' : 'No Files Found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const fileCount = item.isFolder ? getFilesInFolder(item.path).length : 0;

            return (
              <div
                key={item.path}
                onClick={() => handleItemClick(item)}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                  item.isFolder
                    ? 'cursor-pointer border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
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
                      {formatSize(item.size)} • {formatDate(item.lastModified)}
                    </p>
                  )}
                  {item.isFolder && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Folder • {fileCount} file{fileCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
                {!item.isFolder && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(item.path);
                      }}
                      disabled={loadingUrl === item.path}
                      className="inline-flex items-center gap-1 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="View/Download"
                    >
                      {loadingUrl === item.path ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.path);
                      }}
                      disabled={deletingKey === item.path}
                      className="inline-flex items-center gap-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete"
                    >
                      {deletingKey === item.path ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchObjects(false)}
            disabled={loading}
            className="px-6 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {showRepositoryBrowser && (
        <RepositoryBrowser
          onError={onError}
          selectedKnowledgeBase={selectedKnowledgeBase}
          onClose={() => {
            setShowRepositoryBrowser(false);
            fetchObjects(true);
          }}
        />
      )}
    </div>
  );
}
