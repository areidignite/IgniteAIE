import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './hooks/useTheme';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 max-w-md">
            <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Application Error</h1>
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              There was an error loading the application. Please check:
            </p>
            <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 mb-4 space-y-2">
              <li>Your .env file has VITE_SUPABASE_URL</li>
              <li>Your .env file has VITE_SUPABASE_ANON_KEY</li>
              <li>The dev server has reloaded with the .env changes</li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Check the browser console for more details.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
