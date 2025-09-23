'use client';
import { signIn } from 'next-auth/react';

interface LoginPromptProps {
  message: string;
}

export default function LoginPrompt({ message }: LoginPromptProps) {
  return (
    <div className="card grid gap-3 text-center">
      <p className="text-sm text-slate-600">{message}</p>
      <button type="button" className="btn-primary justify-self-center" onClick={() => signIn('discord')}>
        Log in with Discord
      </button>
    </div>
  );
}
