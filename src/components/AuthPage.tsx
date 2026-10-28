import React, { useState } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Building2,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { signInUser, registerUser, requestPasswordReset } from '../services/authService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import type { UserProfile } from '../types';

interface AuthPageProps {
  onAuthenticated: (user: UserProfile, isNewRegistration?: boolean) => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [institution, setInstitution] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);
    setResetFeedback(null);
  };

  const validate = (): boolean => {
    const errors: { name?: string; email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === 'signup' && fullName.trim().length < 2) {
      errors.name = 'Please enter your full name (at least 2 characters).';
    }

    if (!trimmedEmail) {
      errors.email = 'Email address is required.';
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid academic or personal email address.';
    }

    if (mode !== 'forgot') {
      if (!password) {
        errors.password = 'Password is required.';
      } else if (password.length < 6) {
        errors.password = 'Password must contain at least 6 characters.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setResetFeedback(null);

    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === 'signin') {
        const user = await signInUser({ email, password, rememberMe });
        onAuthenticated(user, false);
      } else if (mode === 'signup') {
        const user = await registerUser({
          fullName,
          email,
          password,
          institution,
          rememberMe,
        });
        onAuthenticated(user, true);
      } else {
        const msg = await requestPasswordReset(email);
        setResetFeedback(msg);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative z-10 min-h-screen w-full flex flex-col justify-between">
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-6 sm:px-10 lg:px-14 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* LEFT SECTION — Brand Narrative & Research Highlights */}
        <section className="lg:col-span-7 flex flex-col justify-center space-y-8 lg:pr-6">
          <div>
            <BrandMark size="lg" />
          </div>

          <div className="space-y-5 max-w-xl">
            <h1
              className="font-display font-semibold text-white tracking-tight leading-[1.08]"
              style={{ fontSize: 'clamp(2.4rem, 4.2vw, 3.85rem)' }}
            >
              Discover the Science Within.
            </h1>
            <p className="text-base sm:text-lg text-slate-300/90 leading-relaxed max-w-lg">
              An intelligent research platform for exploring fingerprint-based blood group
              classification.
            </p>
          </div>

          {/* Three Minimal Feature Indicators (Clean unboxed architectural presentation) */}
          <div className="pt-4 border-t border-white/10 max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white tracking-wide">
                AI-Powered Analysis
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Direct dermal ridge tensor inference with your neural classification model.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white tracking-wide">
                Secure Image Handling
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Validated biometric scan uploads with protected session credentials.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-white tracking-wide">
                Interactive Results
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Structured blood group predictions, confidence readouts, and exportable logs.
              </p>
            </div>
          </div>

          {/* Quiet Integration Mode Footnote */}
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Auth Layer: {isSupabaseConfigured ? 'Supabase Cloud Auth' : 'Encrypted Local Workspace'}
            </span>
            <span aria-hidden="true">·</span>
            <span>Keras CNN Inference (/api/predict)</span>
          </div>
        </section>

        {/* RIGHT SECTION — Floating Glassmorphism Authentication Card */}
        <section className="lg:col-span-5 w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
          <div className="relative">
            {/* Subtle Crimson Edge Glow Behind Glass Panel */}
            <div
              aria-hidden="true"
              className="absolute -inset-1 rounded-3xl opacity-40 blur-2xl pointer-events-none"
              style={{
                background:
                  'linear-gradient(135deg, rgba(220, 38, 38, 0.28) 0%, rgba(15, 23, 42, 0.05) 60%, rgba(136, 19, 39, 0.24) 100%)',
              }}
            />

            <div className="relative hemo-glass rounded-2xl p-7 sm:p-9">
              <div className="space-y-1.5 mb-7">
                <h2 className="text-2xl font-semibold text-white tracking-tight">
                  {mode === 'signin'
                    ? 'Welcome Back'
                    : mode === 'signup'
                      ? 'Create Account'
                      : 'Reset Password'}
                </h2>
                <p className="text-sm text-slate-300/80">
                  {mode === 'signin'
                    ? 'Sign in to your analysis workspace.'
                    : mode === 'signup'
                      ? 'Register your research credentials to begin analyzing scans.'
                      : 'Enter your registered email to request recovery instructions.'}
                </p>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="mb-5 p-3.5 rounded-xl bg-red-950/55 border border-red-500/35 flex items-start gap-2.5 text-xs text-red-200 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {resetFeedback && (
                <div
                  role="status"
                  className="mb-5 p-3.5 rounded-xl bg-emerald-950/45 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200 leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{resetFeedback}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label
                        htmlFor="auth-fullname"
                        className="block text-xs font-medium text-slate-300 mb-1.5"
                      >
                        Full Name
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="auth-fullname"
                          type="text"
                          autoComplete="name"
                          value={fullName}
                          onChange={(e) => {
                            setFullName(e.target.value);
                            if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: undefined });
                          }}
                          placeholder="Dr. Ananya Sharma"
                          className="w-full hemo-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                        />
                      </div>
                      {fieldErrors.name && (
                        <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="auth-institution"
                        className="block text-xs font-medium text-slate-300 mb-1.5"
                      >
                        Institution / Department (Optional)
                      </label>
                      <div className="relative">
                        <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="auth-institution"
                          type="text"
                          autoComplete="organization"
                          value={institution}
                          onChange={(e) => setInstitution(e.target.value)}
                          placeholder="Biomedical AI Research Lab"
                          className="w-full hemo-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-slate-300 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                      }}
                      placeholder="researcher@university.edu"
                      className="w-full hemo-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-slate-500"
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.email}</p>
                  )}
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label
                      htmlFor="auth-password"
                      className="block text-xs font-medium text-slate-300 mb-1.5"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="auth-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (fieldErrors.password)
                            setFieldErrors({ ...fieldErrors, password: undefined });
                        }}
                        placeholder="••••••••"
                        className="w-full hemo-input rounded-xl pl-10 pr-11 py-2.5 text-sm text-white placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {fieldErrors.password && (
                      <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.password}</p>
                    )}
                  </div>
                )}

                {mode === 'signin' && (
                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-red-600 focus:ring-red-500/50 focus:ring-offset-0 accent-[#DC2626]"
                      />
                      <span className="text-xs text-slate-300">Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-slate-300 hover:text-white underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 hemo-crimson-btn text-white font-medium text-sm py-3 px-5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {mode === 'signin'
                          ? 'Signing In…'
                          : mode === 'signup'
                            ? 'Creating Account…'
                            : 'Submitting Request…'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === 'signin'
                          ? 'Sign In'
                          : mode === 'signup'
                            ? 'Create Account'
                            : 'Send Reset Instructions'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider with OR */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs font-medium text-slate-400">OR</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="text-center space-y-3">
                {mode === 'signin' ? (
                  <p className="text-xs text-slate-300">
                    New to HemoScan AI?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="font-semibold text-red-400 hover:text-red-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded"
                    >
                      Create Account
                    </button>
                  </p>
                ) : (
                  <p className="text-xs text-slate-300">
                    Already registered?{' '}
                    <button
                      type="button"
                      onClick={() => switchMode('signin')}
                      className="font-semibold text-red-400 hover:text-red-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded"
                    >
                      Back to Sign In
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-[1360px] mx-auto px-6 sm:px-10 lg:px-14 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 border-t border-white/5">
        <p>HemoScan AI — Academic Research Demonstration Platform</p>
        <p>
          Experimental research only — fingerprint-based blood-group prediction is not medically
          validated. Confirm blood type with standard laboratory testing.
        </p>
      </footer>
    </div>
  );
};
