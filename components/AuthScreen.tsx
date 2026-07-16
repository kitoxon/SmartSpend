import React, { useState } from 'react';
import { KeyRound, Landmark, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

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
    <div className="min-h-screen bg-black text-zinc-200 flex items-center justify-center px-5 py-10 font-sans">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="w-11 h-11 rounded-xl bg-white text-black flex items-center justify-center mb-5">
            <Landmark size={20} strokeWidth={2.5} />
          </div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-zinc-600 font-bold mb-2">Private finance tracker</p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Your money, on every device.</h1>
          <p className="text-sm text-zinc-500 mt-3 leading-relaxed">
            Sign in with the same email on your PC and smartphone. Your Supabase data is isolated to your account.
          </p>
        </div>

        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 shadow-2xl">
          <form onSubmit={sendSignInEmail} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 text-zinc-500" size={17} />
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-12 pl-10 pr-3 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-zinc-600"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 bg-white hover:bg-zinc-200 disabled:opacity-60 text-black font-bold rounded-lg text-xs uppercase tracking-wider flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Email me a sign-in link
            </button>
          </form>

          {sent && (
            <form onSubmit={verifyCode} className="mt-4 pt-4 border-t border-zinc-800 space-y-3">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">One-time code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="123456"
                  className="min-w-0 flex-1 h-11 px-3 bg-zinc-950 border border-zinc-800 rounded-lg text-white tracking-[0.25em] outline-none focus:border-zinc-600"
                />
                <button type="submit" disabled={isSubmitting || !code} className="px-4 h-11 rounded-lg bg-zinc-800 text-xs font-bold text-white disabled:opacity-50">
                  Verify
                </button>
              </div>
            </form>
          )}

          {message && <p className="mt-4 text-xs text-zinc-400 leading-relaxed">{message}</p>}
          {error && <p className="mt-4 text-xs text-red-400 leading-relaxed">{error}</p>}
        </div>

        <div className="mt-5 flex items-start gap-2 text-[11px] text-zinc-600 leading-relaxed">
          <ShieldCheck size={14} className="mt-0.5 shrink-0" />
          <span>The browser stores a session token; database RLS still enforces ownership on every request.</span>
        </div>
      </div>
    </div>
  );
};
