import { FolderOpen, File, Download, RefreshCw, Upload, Trash2, RefreshCcw, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface S3Object {
  Key: string;
  Size: number;
  LastModified: string;
  ETag: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusCheckIntervalRef = useRef<number | null>(null);

  const fetchObjects = async (resetList = false) => {
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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
    fetchObjects(true);
  }, [selectedKnowledgeBase]);

  const filteredObjects = filterText
    ? allObjects.filter(obj => obj.Key.toLowerCase().includes(filterText.toLowerCase()))
    : allObjects;

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
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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

  const getFileIcon = (key: string) => {
    return key.endsWith('/') ? <FolderOpen className="w-4 h-4" /> : <File className="w-4 h-4" />;
  };

  const getFileName = (key: string) => {
    const parts = key.split('/');
    return parts[parts.length - 1] || key;
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileArray = Array.from(files);
    let successCount = 0;
    let failedFiles: string[] = [];

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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
    if (!confirm(`Are you sure you want to delete "${getFileName(key)}"?`)) {
      return;
    }

    setDeletingKey(key);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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

  const checkIngestionStatus = async (
    knowledgeBaseId: string,
    dataSourceId: string,
    ingestionJobId: string
  ) => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchObjects(true)}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
          >
            {uploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || !selectedKnowledgeBase}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
              title={!selectedKnowledgeBase ? 'Select a knowledge base first' : 'Sync S3 bucket with knowledge base'}
            >
              {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Sync KB
            </button>
            {syncing && (
              <button
                onClick={handleStopSync}
                className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors inline-flex items-center gap-1.5"
                title="Stop sync"
              >
                <X className="w-4 h-4" />
                Stop
              </button>
            )}
            {syncStatus && (
              <span className={`text-sm ${syncing ? 'text-amber-600' : syncStatus.includes('failed') || syncStatus.includes('cancelled') ? 'text-red-600' : 'text-emerald-600'}`}>
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
            className={`w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${filterText ? 'pr-20' : ''}`}
          />
          {filterText && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 bg-white px-1">
              {filteredObjects.length} of {allObjects.length}
            </div>
          )}
        </div>
      </div>

      {filteredObjects.length === 0 && !loading ? (
        <div className="text-center py-8 text-slate-400 border border-slate-200 rounded-lg">
          <FolderOpen className="w-12 h-12 mx-auto mb-3" />
          <p>{filterText ? 'No files match your search' : 'No Files Found'}</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Size</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-700">Last Modified</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredObjects.map((obj) => (
                <tr key={obj.Key} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getFileIcon(obj.Key)}
                      <span className="text-sm text-slate-800 truncate max-w-md" title={obj.Key}>
                        {getFileName(obj.Key)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatSize(obj.Size)}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{formatDate(obj.LastModified)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleDownload(obj.Key)}
                        disabled={loadingUrl === obj.Key || obj.Key.endsWith('/')}
                        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={obj.Key.endsWith('/') ? 'Cannot download folders' : 'View/Download'}
                      >
                        {loadingUrl === obj.Key ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        View
                      </button>
                      <button
                        onClick={() => handleDelete(obj.Key)}
                        disabled={deletingKey === obj.Key || obj.Key.endsWith('/')}
                        className="inline-flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={obj.Key.endsWith('/') ? 'Cannot delete folders' : 'Delete'}
                      >
                        {deletingKey === obj.Key ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchObjects(false)}
            disabled={loading}
            className="px-6 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
