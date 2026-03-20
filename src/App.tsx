import { useEffect, useState } from 'react';
import { FileText, LogOut, Info, Trash2, Sun, Moon } from 'lucide-react';
import { supabase, getValidSession, type Document } from './lib/supabase';
import { AuthForm } from './components/AuthForm';
import { UpdatePasswordForm } from './components/UpdatePasswordForm';
import { PromptArea } from './components/PromptArea';
import { DocumentViewer } from './components/DocumentViewer';
import { DocumentList } from './components/DocumentList';
import { ErrorDialog } from './components/ErrorDialog';
import { WorkspaceEditor } from './components/WorkspaceEditor';
import { ModelSelector } from './components/ModelSelector';
import { KnowledgeBaseSelector } from './components/KnowledgeBaseSelector';
import { ResizablePanel } from './components/ResizablePanel';
import { ResizablePanelHorizontal } from './components/ResizablePanelHorizontal';
import { S3BucketBrowser } from './components/S3BucketBrowser';
import { useTheme } from './hooks/useTheme';

interface FoundationModel {
  modelArn: string;
  modelId: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
  responseStreamingSupported: boolean;
  inferenceProfileId?: string;
  inferenceProfileName?: string;
  inferenceProfileArn?: string;
}

interface KnowledgeBase {
  knowledgeBaseId: string;
  name: string;
  description?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  dataSourceId?: string;
}

const KNOWLEDGE_BASE_SUPPORTED_MODEL_PREFIXES = [
  'ai21.jamba',
  'amazon.nova',
  'anthropic.claude',
  'cohere.command',
  'deepseek',
  'meta.llama3-8b',
  'meta.llama3-70b',
  'meta.llama3-1',
  'meta.llama3-2-11b',
  'meta.llama3-2-90b',
  'meta.llama3-3',
  'mistral'
];

const KNOWLEDGE_BASE_UNSUPPORTED_PATTERNS = [
  'meta.llama3-2-1b',
  'meta.llama3-2-3b',
  'meta.llama4',
  'twelvelabs'
];

function isModelSupportedForKnowledgeBase(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase();

  if (KNOWLEDGE_BASE_UNSUPPORTED_PATTERNS.some(pattern => lowerModelId.includes(pattern))) {
    return false;
  }

  return KNOWLEDGE_BASE_SUPPORTED_MODEL_PREFIXES.some(prefix => lowerModelId.startsWith(prefix));
}

function App() {
  const { theme, toggleTheme } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [improvingPrompt, setImprovingPrompt] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [currentContent, setCurrentContent] = useState('');
  const [currentCitations, setCurrentCitations] = useState<Array<{ text: string; location?: any }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [workspaceContent, setWorkspaceContent] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [models, setModels] = useState<FoundationModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('anthropic.claude-sonnet-4-5-20250929-v1:0');
  const [loadingModels, setLoadingModels] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [selectedKnowledgeBase, setSelectedKnowledgeBase] = useState<string>('');
  const [loadingKnowledgeBases, setLoadingKnowledgeBases] = useState(false);
  const [useKnowledgeBase, setUseKnowledgeBase] = useState(true);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 's3-browser'>('documents');
  const [prompt, setPrompt] = useState('');
  const [storageBlocked, setStorageBlocked] = useState(false);

  useEffect(() => {
    // Check for storage access
    const checkStorage = () => {
      try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        setStorageBlocked(false);
      } catch (e) {
        console.error('localStorage blocked:', e);
        setStorageBlocked(true);
      }
    };

    checkStorage();

    // Initialize session using onAuthStateChange (recommended approach)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      console.log('Session user:', session?.user?.email || 'no user');
      console.log('Session token (first 20 chars):', session?.access_token?.substring(0, 20) || 'no token');

      if (event === 'SIGNED_OUT') {
        setUser(null);
        setSession(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setUser(session?.user ?? null);
        setSession(session);
      } else if (event === 'USER_UPDATED') {
        setUser(session?.user ?? null);
        setSession(session);
      }

      // Mark loading as complete after first event
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadDocuments();
      loadWorkspace();
      fetchModels();
      fetchKnowledgeBases();
    }
  }, [user]);

  useEffect(() => {
    if (useKnowledgeBase && models.length > 0) {
      const selectedModelData = models.find(m => m.modelArn === selectedModel);
      if (selectedModelData && !isModelSupportedForKnowledgeBase(selectedModelData.modelId)) {
        const compatibleModel = models.find(m => isModelSupportedForKnowledgeBase(m.modelId));
        if (compatibleModel) {
          setSelectedModel(compatibleModel.modelArn);
        }
      }
    }
  }, [useKnowledgeBase]);

  const loadDocuments = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading documents:', error);
    } else {
      setDocuments(data || []);
    }
  };

  const loadWorkspace = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('workspace')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error loading workspace:', error);
    } else if (data) {
      setWorkspaceContent(data.content || '');
      setWorkspaceId(data.id);
    }
  };

  const saveWorkspace = async () => {
    if (!user) return;

    setSavingWorkspace(true);
    try {
      if (workspaceId) {
        const { error } = await supabase
          .from('workspace')
          .update({ content: workspaceContent })
          .eq('id', workspaceId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('workspace')
          .insert({ user_id: user.id, content: workspaceContent })
          .select()
          .single();

        if (error) throw error;
        if (data) setWorkspaceId(data.id);
      }
    } catch (error) {
      console.error('Error saving workspace:', error);
      setError('Failed to save workspace');
    } finally {
      setSavingWorkspace(false);
    }
  };

  const clearWorkspace = () => {
    setWorkspaceContent('');
  };

  const fetchModels = async () => {
    if (!user) return;

    setLoadingModels(true);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-foundation-models`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch models');
      }

      const data = await response.json();
      const filteredModels = (data.models || []).filter((model: FoundationModel) => {
        return !model.modelId.toLowerCase().includes('twelvelabs');
      });
      const sortedModels = filteredModels.sort((a: FoundationModel, b: FoundationModel) => {
        return a.modelName.localeCompare(b.modelName);
      });
      setModels(sortedModels);

      if (sortedModels.length > 0 && selectedModel === 'anthropic.claude-sonnet-4-5-20250929-v1:0') {
        const defaultModel = sortedModels.find(m =>
          m.modelId === 'anthropic.claude-sonnet-4-5-20250929-v1:0' ||
          m.modelArn.includes('anthropic.claude-sonnet-4-5-20250929-v1:0')
        );
        if (defaultModel) {
          setSelectedModel(defaultModel.modelArn);
        } else {
          setSelectedModel(sortedModels[0].modelArn);
        }
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch models');
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchKnowledgeBases = async () => {
    if (!user) return;

    setLoadingKnowledgeBases(true);
    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-knowledge-bases`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error('[KB] Response not OK:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        });

        const errorText = await response.text();
        console.error('[KB] Error response body:', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        throw new Error(errorData.error || `Failed to fetch knowledge bases (${response.status})`);
      }

      const data = await response.json();
      const kbs = data.knowledgeBases || [];
      setKnowledgeBases(kbs);

      if (kbs.length > 0 && !selectedKnowledgeBase) {
        setSelectedKnowledgeBase(kbs[0].knowledgeBaseId);
      }
    } catch (error) {
      console.error('Error fetching knowledge bases:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch knowledge bases');
    } finally {
      setLoadingKnowledgeBases(false);
    }
  };

  const handleSignIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const handleSignUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const handleResetPassword = async (email: string, code: string, newPassword: string) => {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-reset-code`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email, code, newPassword }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }

    // After successful password reset, sign in with the new password
    await handleSignIn(email, newPassword);
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setDocuments([]);
      setSelectedDocument(null);
      setCurrentPrompt('');
      setCurrentContent('');
      setCurrentCitations([]);
      setWorkspaceContent('');
      setWorkspaceId(null);
      setModels([]);
      setSelectedModel('anthropic.claude-sonnet-4-5-20250929-v1:0');
      setKnowledgeBases([]);
      setSelectedKnowledgeBase('');
      setUseKnowledgeBase(true);
      setUser(null);
      setSession(null);
    }
  };

  const handleImprovePrompt = async (prompt: string, companyVoice: 'ignite-it' | 'ignite-action'): Promise<string> => {
    if (!user) return prompt;

    setImprovingPrompt(true);

    try {
      const session = await getValidSession();
      const token = session?.access_token;

      if (!token) {
        throw new Error('No authentication token');
      }

      let systemPrompt = '';

      if (companyVoice === 'ignite-action') {
        systemPrompt = `You are an IgniteAction proposal writer preparing a response for a federal Request for Information (RFI) or Request for Quotation (RFQ) related to the Census Bureau OCISS BPA.

Transform the user's prompt by adding these specific instructions for the AI that will generate the response:

"You are writing this response as an IgniteAction employee. Write in first-person voice using 'we', 'our', and 'IgniteAction'. Do NOT start with phrases like 'Based on the available information' or 'According to the documents'. Write confidently and directly as if you are the IgniteAction proposal writer presenting our company's capabilities and experience.

Frame your response as an RFI/RFQ answer that:
- Uses federal acquisition language (PWS, COR/COTR oversight, risk, schedule, performance metrics)
- Highlights IgniteAction's program management methodology, governance structure, and proven Census/federal modernization experience
- Demonstrates readiness, governance maturity, communication excellence, and risk management capabilities
- Maintains a clear, professional, outcome-focused tone (no marketing fluff)
- Targets 250-350 words unless otherwise specified

Write as an IgniteAction representative presenting our solutions directly to the government customer."

Return ONLY the improved prompt text that will be sent to the knowledge base, nothing else.`;
      } else {
        systemPrompt = `You are an Ignite IT technical consultant preparing responses for federal IT modernization projects.

Transform the user's prompt by adding these specific instructions for the AI that will generate the response:

"You are writing this response as an Ignite IT employee. Write in first-person voice using 'we', 'our', and 'Ignite IT'. Do NOT start with phrases like 'Based on the available information' or 'According to the documents'. Write confidently and directly as if you are the Ignite IT technical consultant presenting our company's technical capabilities and expertise.

Frame your response with:
- Technical precision and IT infrastructure context
- Emphasis on technology stack, architecture, security frameworks, and best practices
- Alignment with federal IT standards (NIST, FedRAMP, FISMA, etc.)
- Focus on technical implementation, scalability, and operational excellence
- Detailed, technically accurate explanations

Use Ignite IT's established tone: technical, precise, and infrastructure-focused, highlighting our expertise in cloud migration, cybersecurity, DevSecOps, and enterprise technology solutions.

Write as an Ignite IT representative presenting our technical solutions directly to the customer."

Return ONLY the improved prompt text that will be sent to the knowledge base, nothing else.`;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bedrock-llm`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `Original prompt: "${prompt}"\n\nProvide an improved version of this prompt.`,
            modelArn: 'anthropic.claude-haiku-4-5-20251001-v1:0',
            useKnowledgeBase: false,
            generateTitle: false,
            systemPrompt
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('AWS Bedrock rate limit exceeded. Please wait 30-60 seconds before trying again.');
        }
        const errorText = await response.text();
        console.error('Edge function error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }
        console.error('Parsed error data:', errorData);

        if (response.status === 401) {
          throw new Error(`Authentication failed: ${errorData.details || errorData.error || errorData.message || 'Invalid token'}`);
        }
        throw new Error(errorData.message || errorData.error || 'Failed to improve prompt');
      }

      const data = await response.json();
      return data.answer.trim();
    } catch (err) {
      console.error('Error improving prompt:', err);
      setError(err instanceof Error ? err.message : 'Failed to improve prompt');
      return prompt;
    } finally {
      setImprovingPrompt(false);
    }
  };

  const handlePromptSubmit = async (prompt: string, attachments?: Array<{ name: string; s3Key: string; size: number }>, includeCitations?: boolean) => {
    if (!user) return;

    setGenerating(true);
    setCurrentPrompt(prompt);
    setCurrentContent('');
    setCurrentCitations([]);

    try {
      const validSession = await getValidSession();
      if (!validSession?.access_token) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const token = validSession.access_token;

      const selectedModelData = models.find(m => m.modelArn === selectedModel);

      if (useKnowledgeBase && selectedModelData && !isModelSupportedForKnowledgeBase(selectedModelData.modelId)) {
        throw new Error(`${selectedModelData.modelName} is not supported for Knowledge Base queries. Please either:\n1. Disable "Use Knowledge Base" checkbox, or\n2. Select a different model that supports Knowledge Bases (such as Llama 3.2 11B or 90B, Claude, Nova, etc.)`);
      }

      console.log('Selected model:', selectedModel);
      console.log('Selected model data:', selectedModelData);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bedrock-llm`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: prompt,
            modelArn: selectedModel,
            inferenceProfileId: selectedModelData?.inferenceProfileId,
            inferenceProfileArn: selectedModelData?.inferenceProfileArn,
            knowledgeBaseId: selectedKnowledgeBase,
            useKnowledgeBase,
            generateTitle: true,
            attachments,
            includeCitations
          }),
        }
      );

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: response.statusText };
        }

        if (response.status === 429) {
          throw new Error('AWS Bedrock rate limit exceeded. Please wait 30-60 seconds before trying again.');
        }

        const errorMsg = errorData?.error || errorData?.message || 'Failed to generate content';
        const details = errorData?.details;
        throw new Error(details ? `${errorMsg}\n\nDetails: ${details}` : errorMsg);
      }

      const data = await response.json();

      const content = data.answer;
      const citations = data.citations || [];
      const generatedTitle = data.title || prompt.slice(0, 50) + (prompt.length > 50 ? '...' : '');

      setCurrentContent(content);
      setCurrentCitations(citations);

      const { data: newDoc, error } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          title: generatedTitle,
          prompt,
          content,
          used_knowledge_base: useKnowledgeBase,
          model_arn: selectedModel,
          model_name: selectedModelData?.modelName,
          citations,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving document:', error);
      } else {
        setDocuments([newDoc, ...documents]);
        setSelectedDocument(newDoc);
      }
    } catch (error) {
      console.error('Error generating document:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate document. Please check your AWS credentials.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectDocument = (doc: Document) => {
    setSelectedDocument(doc);
    setCurrentPrompt(doc.prompt);
    setCurrentContent(doc.content);
    setCurrentCitations(doc.citations || []);
  };

  const handleDeleteDocument = async (id: string) => {
    const { error } = await supabase.from('documents').delete().eq('id', id);

    if (error) {
      console.error('Error deleting document:', error);
    } else {
      setDocuments(documents.filter(doc => doc.id !== id));
      if (selectedDocument?.id === id) {
        setSelectedDocument(null);
        setCurrentPrompt('');
        setCurrentContent('');
        setCurrentCitations([]);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-300">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSignIn={handleSignIn} onSignUp={handleSignUp} onResetPassword={handleResetPassword} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {storageBlocked && (
        <div className="bg-amber-500 text-white px-6 py-3 text-center text-sm">
          <strong>Warning:</strong> Browser storage is blocked by tracking prevention. The app will work, but you'll need to log in again if you refresh the page.
          For the best experience, disable tracking prevention for this site or use Chrome/Firefox.
        </div>
      )}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="mx-auto px-6 py-4 flex items-center gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <img
                src="igniteicon.png"
                alt="IgniteIT Logo"
                className="h-16 w-16 object-contain"
              />
              <div>
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">IgniteAIE Document Builder</h1>
                <p className="text-base text-slate-500 dark:text-slate-400">Ignite AI Engine powered document generation</p>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-1">
              <button
                onClick={() => setShowInfoDialog(true)}
                className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title="How it works"
              >
                <Info className="w-5 h-5" />
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="use-kb"
                checked={useKnowledgeBase}
                onChange={(e) => setUseKnowledgeBase(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <label htmlFor="use-kb" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                Use Knowledge Base
              </label>
            </div>
            <KnowledgeBaseSelector
              selectedKnowledgeBase={selectedKnowledgeBase}
              onKnowledgeBaseChange={setSelectedKnowledgeBase}
              onRefresh={fetchKnowledgeBases}
              knowledgeBases={knowledgeBases}
              isLoading={loadingKnowledgeBases}
            />
            <ModelSelector
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              onRefresh={fetchModels}
              models={useKnowledgeBase ? models.filter(m => isModelSupportedForKnowledgeBase(m.modelId)) : models}
              isLoading={loadingModels}
              onSignOut={handleSignOut}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto px-6 py-8" style={{ minHeight: 'calc(100vh - 12rem)' }}>
        <ResizablePanelHorizontal
          initialLeftPercent={35}
          minLeftPercent={25}
          minRightPercent={30}
          leftPanel={
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Ignite AI Engine</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt('');
                      setCurrentContent('');
                      setCurrentPrompt('');
                      setCurrentCitations([]);
                      setSelectedDocument(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Clear
                  </button>
                </div>
                <PromptArea
                  onSubmit={handlePromptSubmit}
                  isLoading={generating}
                  onImprovePrompt={handleImprovePrompt}
                  isImprovingPrompt={improvingPrompt}
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  selectedKnowledgeBase={selectedKnowledgeBase}
                />
              </div>
              <div className="p-4">
                <DocumentViewer
                  content={currentContent}
                  prompt={currentPrompt}
                  citations={currentCitations}
                  usedKnowledgeBase={selectedDocument?.used_knowledge_base}
                  modelName={selectedDocument?.model_name}
                />
              </div>
            </div>
          }
          rightPanel={
            <ResizablePanelHorizontal
              initialLeftPercent={45}
              minLeftPercent={30}
              minRightPercent={30}
              leftPanel={
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col" style={{ minHeight: '600px' }}>
                  <div className="flex items-center gap-4 mb-4 border-b border-slate-200 dark:border-slate-700">
                    <button
                      onClick={() => setActiveTab('documents')}
                      className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
                        activeTab === 'documents'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Documents
                    </button>
                    <button
                      onClick={() => setActiveTab('s3-browser')}
                      className={`pb-3 px-2 text-sm font-medium transition-colors relative ${
                        activeTab === 's3-browser'
                          ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      File Browser
                    </button>
                  </div>

                  {activeTab === 'documents' ? (
                    <>
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Your Documents (drag to Create Document window)</h2>
                      <div className="flex-1 overflow-y-auto">
                        <DocumentList
                          documents={documents}
                          selectedId={selectedDocument?.id || null}
                          onSelect={handleSelectDocument}
                          onDelete={handleDeleteDocument}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4">Knowledge Base Contents</h2>
                      <div className="flex-1 overflow-y-auto">
                        <S3BucketBrowser
                          onError={setError}
                          selectedKnowledgeBase={selectedKnowledgeBase}
                        />
                      </div>
                    </>
                  )}
                </div>
              }
              rightPanel={
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col" style={{ minHeight: '600px' }}>
                  <WorkspaceEditor
                    content={workspaceContent}
                    onChange={setWorkspaceContent}
                    onSave={saveWorkspace}
                    onClear={clearWorkspace}
                    isSaving={savingWorkspace}
                  />
                </div>
              }
            />
          }
        />
      </main>

      {error && <ErrorDialog error={error} onClose={() => setError(null)} />}

      {showInfoDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">How Document Builder Works</h2>
              <button
                onClick={() => setShowInfoDialog(false)}
                className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">Knowledge Base Query Flow (RAG)</h3>
                <div className="space-y-4 text-slate-600 dark:text-slate-300">
                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">1. User Input</h4>
                    <p className="text-sm">You enter a prompt and select a foundation model from the dropdown.</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">2. Query Submission</h4>
                    <p className="text-sm">The frontend sends your prompt along with the selected model's ARN to the edge function.</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">3. Knowledge Base RAG Process</h4>
                    <p className="text-sm mb-2">When "Use Knowledge Base" is checked, the edge function calls AWS Bedrock's retrieveAndGenerate API, which automatically performs:</p>
                    <ul className="list-disc list-inside text-sm space-y-1 ml-4">
                      <li><strong>Retrieval:</strong> Searches the Knowledge Base vector store for the 5 most relevant documents</li>
                      <li><strong>Context Assembly:</strong> Retrieves the relevant text chunks from those documents</li>
                      <li><strong>Generation:</strong> Sends your prompt + retrieved context to the selected foundation model</li>
                      <li>The foundation model generates an answer grounded in the retrieved documents</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">4. Response with Citations</h4>
                    <p className="text-sm">Bedrock returns the generated answer along with citations showing which documents were used, including text excerpts and source locations.</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">5. AI-Generated Title</h4>
                    <p className="text-sm">After receiving the response, the system uses Claude 3.5 Haiku to automatically generate a concise, descriptive 5-10 word title that summarizes the document content. This title is displayed in bold in your document list.</p>
                  </div>

                  <div>
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-1">6. Display & Save</h4>
                    <p className="text-sm">The answer, title, citations, model information, and metadata are displayed in the UI and saved to your database for future reference.</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 dark:text-blue-300 mb-2">Without Knowledge Base</h4>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  When "Use Knowledge Base" is unchecked, your query goes directly to the selected foundation model via Bedrock's Converse API, without any document retrieval - just a standard LLM conversation.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setShowInfoDialog(false)}
                className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
