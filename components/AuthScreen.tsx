import React, { useState } from 'react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { APP_NAME } from '../constants';

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendSignInEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !email.trim()) return;
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    setIsSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
    setMessage('Check your email. Open the sign-in link on this device, or enter the one-time code below.');
  };

  const verifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !email.trim() || !code.trim()) return;
    setIsSubmitting(true);
    setError(null);
    const { error: authError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setIsSubmitting(false);
    if (authError) setError(authError.message);
  };

  return (
    <div className="min-h-screen bg-page text-ink flex items-center justify-center px-5 py-10 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <img src="/favicon.svg" alt="" className="mb-5 h-11 w-11 rounded-xl" />
          <p className="mb-1 text-[13px] text-ink-2">{APP_NAME}</p>
          <h1 className="text-2xl font-medium text-ink">See what's free until payday.</h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            Sign in with the same email on your phone and computer. Your data is private to your account.
          </p>
        </div>

        <div className="bg-card border border-line rounded-2xl p-5">
          <form onSubmit={sendSignInEmail} className="space-y-4">
            <div>
              <label className="field-label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-ink-3" size={17} />
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-12 pl-10 pr-3 bg-subtle border border-line rounded-lg text-ink outline-none focus:border-accent"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary h-12 w-full"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Email me a sign-in link
            </button>
          </form>

          {sent && (
            <form onSubmit={verifyCode} className="mt-4 pt-4 border-t border-line space-y-3">
              <label className="field-label">One-time code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="123456"
                  className="min-w-0 flex-1 h-11 px-3 bg-subtle border border-line rounded-lg text-ink tracking-[0.25em] outline-none focus:border-accent"
                />
                <button type="submit" disabled={isSubmitting || !code} className="btn">
                  Verify
                </button>
              </div>
            </form>
          )}

          {message && <p className="mt-4 text-xs text-ink-2 leading-relaxed">{message}</p>}
          {error && <p className="mt-4 text-xs text-bad leading-relaxed">{error}</p>}
        </div>

        <div className="mt-5 flex items-start gap-2 text-xs text-ink-3 leading-relaxed">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span>The browser stores a session token; database RLS still enforces ownership on every request.</span>
        </div>
      </div>
    </div>
  );
};
