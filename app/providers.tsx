'use client';
import type { ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { SWRConfig } from 'swr';
import { AuthCallbackHandler } from '@/components/AuthCallbackHandler';

interface ProvidersProps {
  children: ReactNode;
  session: Session | null;
}

export function Providers({ children, session }: ProvidersProps) {
  return (
    <SessionProvider 
      session={session}
      refetchInterval={5 * 60} // Refetch every 5 minutes to keep session in sync
      refetchOnWindowFocus={true} // Refetch when window gains focus
    >
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          fetcher: async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(await res.text());
            return res.json();
          },
        }}
      >
        <AuthCallbackHandler />
        {children}
      </SWRConfig>
    </SessionProvider>
  );
}