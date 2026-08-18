'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/providers/AuthProvider';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/store';

type Mode = 'signin' | 'signup';

/** Rough strength signal. Not a security control — Firebase enforces the real
 *  minimum — just enough feedback that people don't pick "123456". */
function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^\w\s]/.test(password)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { score, label: labels[Math.min(score, 5)] };
}

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, signUp, signInWithGoogle, resetPassword, configured } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const next = params.get('next') ?? '/';
  const pw = strength(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') await signIn(email, password);
      else await signUp(name, email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGoogleBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) { setError('Enter your email first, then tap reset.'); return; }
    try {
      await resetPassword(email);
      toast('Password reset sent — check your inbox', { tone: 'success' });
    } catch (err) { setError((err as Error).message); }
  };

  if (!configured) {
    return (
      <div className="rounded-xl border border-flare/25 bg-flare/[0.07] p-4">
        <p className="text-[13px] leading-relaxed text-cream-dim">
          <span className="font-medium text-cream">Authentication is not configured.</span>{' '}
          Add your Firebase web-app credentials to the environment and redeploy —
          see <code className="font-mono text-[12px] text-flare">.env.example</code>.
          Everything else on PRISM works without signing in.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button
        onClick={google}
        disabled={googleBusy || busy}
        className={cn(
          'flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-line-strong',
          'text-[14px] font-medium text-cream transition-[background-color,border-color] duration-300',
          'hover:border-cream/30 hover:bg-cream/[0.05] disabled:opacity-50',
        )}
      >
        {googleBusy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
        ) : (
          <GoogleGlyph />
        )}
        Continue with Google
      </button>

      <div className="flex items-center gap-4">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <Field
            label="Name"
            value={name}
            onChange={setName}
            type="text"
            autoComplete="name"
            placeholder="What should we call you?"
            maxLength={60}
          />
        )}

        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />

        <div>
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            type={show ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
            required
            minLength={6}
            trailing={
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:text-cream"
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            }
          />

          {mode === 'signup' && password.length > 0 && (
            <div className="mt-2 flex items-center gap-2.5">
              <div className="flex flex-1 gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-[3px] flex-1 rounded-full transition-colors duration-300',
                      i < pw.score ? (pw.score >= 4 ? 'bg-mint' : pw.score >= 3 ? 'bg-flare-soft' : 'bg-flare') : 'bg-ink-600',
                    )}
                  />
                ))}
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-[10px] text-faint">{pw.label}</span>
            </div>
          )}

          {mode === 'signin' && (
            <button
              type="button"
              onClick={forgot}
              className="mt-2.5 text-[12px] text-muted transition-colors hover:text-cream"
            >
              Forgot your password?
            </button>
          )}
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              role="alert"
              className="flex items-start gap-2 overflow-hidden text-[12.5px] leading-relaxed text-flare"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <Button type="submit" size="lg" loading={busy} className="w-full">
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, trailing, ...rest
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  trailing?: React.ReactNode;
  // `value`/`onChange` are re-declared above with a simpler signature, so the
  // native handler types have to be excluded rather than merged.
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const id = `field-${label.toLowerCase().replace(/\s/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-11 w-full rounded-xl border border-line bg-ink-850 px-3.5 text-[14px] text-cream outline-none',
            'transition-[border-color,background-color] duration-300 placeholder:text-faint',
            'hover:border-line-strong focus:border-flare/60 focus:bg-ink-800',
            trailing && 'pr-11',
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-2">{trailing}</span>}
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.08 3.57-5.15 3.57-8.87Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}
