'use client';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';

export default function AppHeader() {
  const { data: session, status } = useSession();
  const isLoading = status === 'loading';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="container-page flex items-center justify-between py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900">
          No Stress Planner
        </Link>
        <nav className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Link href="/host" className="hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2">
            Host an event
          </Link>
          <Link href="/attend" className="hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2">
            Join an event
          </Link>
          {session && (
            <span className="text-slate-500 text-sm">
              Logged in as: <span className="font-semibold text-slate-700">{session.user?.name}</span>
            </span>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => (session ? signOut() : signIn('discord'))}
            disabled={isLoading}
          >
            {isLoading ? '...' : session ? 'Log out' : 'Log in with Discord'}
          </button>
        </nav>
      </div>
    </header>
  );
}