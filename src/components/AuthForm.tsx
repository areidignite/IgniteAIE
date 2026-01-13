import { useState } from 'react';
import { FileText } from 'lucide-react';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
  onResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

export function AuthForm({ onSignIn, onSignUp, onResetPassword }: AuthFormProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isResetPassword) {
        if (!showCodeInput) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reset-code`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ email }),
            }
          );

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to send reset code');
          }

          const debugMsg = data.debugCode
            ? `Reset code sent to ${email}! (Code: ${data.debugCode})`
            : `Reset code sent to ${email}! Check your email.`;

          setSuccessMessage(debugMsg);
          setShowCodeInput(true);
        } else {
          if (newPassword !== confirmPassword) {
            throw new Error('Passwords do not match');
          }

          if (newPassword.length < 6) {
            throw new Error('Password must be at least 6 characters');
          }

          await onResetPassword(email, resetCode, newPassword);
          setSuccessMessage('Password updated successfully!');
          setTimeout(() => {
            setIsResetPassword(false);
            setShowCodeInput(false);
            setEmail('');
            setResetCode('');
            setNewPassword('');
            setConfirmPassword('');
            setSuccessMessage('');
          }, 2000);
        }
      } else if (isSignUp) {
        await onSignUp(email, password);
      } else {
        await onSignIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToSignIn = () => {
    setIsResetPassword(false);
    setShowCodeInput(false);
    setError('');
    setSuccessMessage('');
    setEmail('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Document Builder</h1>
          <p className="text-slate-600">AI-powered document generation</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-8">
          {!isResetPassword && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setIsSignUp(false)}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  !isSignUp
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setIsSignUp(true)}
                className={`flex-1 py-2 rounded-lg font-medium transition-colors ${
                  isSignUp
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sign Up
              </button>
            </div>
          )}

          {isResetPassword && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-slate-800 mb-2">
                {showCodeInput ? 'Enter Reset Code' : 'Reset Password'}
              </h2>
              <p className="text-sm text-slate-600">
                {showCodeInput
                  ? 'Enter the 4-digit code sent to your email'
                  : 'Enter your email to receive a 4-digit reset code'}
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isResetPassword && showCodeInput ? (
              <>
                <div>
                  <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-1">
                    Reset Code
                  </label>
                  <input
                    id="code"
                    type="text"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    required
                    maxLength={4}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl font-mono tracking-widest"
                    placeholder="••••"
                  />
                </div>

                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={showCodeInput}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
                    placeholder="you@example.com"
                  />
                </div>

                {!isResetPassword && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••"
                    />
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {successMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {loading
                ? 'Please wait...'
                : isResetPassword
                ? showCodeInput
                  ? 'Reset Password'
                  : 'Send Code'
                : isSignUp
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            {isResetPassword ? (
              <button
                onClick={handleBackToSignIn}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Back to Sign In
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsResetPassword(true);
                  setError('');
                  setSuccessMessage('');
                }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Forgot Password?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
