'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

/**
 * Professional authentication callback handler
 * Handles server-side re-rendering after OAuth authentication
 */
export function AuthCallbackHandler() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const hasTriggeredUpdate = useRef(false);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Check if this is an OAuth callback by looking at the URL
    const urlParams = new URLSearchParams(window.location.search);
    const isOAuthCallback = urlParams.has('code') || urlParams.has('state');
    
    // Also check if we just came from a NextAuth callback by looking at referrer
    const referrer = document.referrer;
    const isFromNextAuthCallback = referrer.includes('/api/auth/callback/');
    
    console.log('🔍 AuthCallbackHandler:', { 
      isOAuthCallback, 
      isFromNextAuthCallback,
      referrer,
      status, 
      hasSession: !!session,
      url: window.location.href 
    });
    
    // If this looks like an OAuth callback OR we came from a NextAuth callback
    if ((isOAuthCallback || isFromNextAuthCallback) && !hasTriggeredUpdate.current) {
      console.log('🔍 OAuth callback detected, forcing session refresh...');
      hasTriggeredUpdate.current = true;
      
      // First, try to fetch the session directly to trigger the session callback
      fetch('/api/auth/session')
        .then(response => response.json())
        .then(sessionData => {
          console.log('🔍 Direct session fetch result:', sessionData);
          
          // Then force session update
          return update();
        })
        .then(() => {
          console.log('🔍 Session update completed');
          // Then refresh the page
          setTimeout(() => {
            router.refresh();
          }, 500);
        })
        .catch((error) => {
          console.error('🔍 Session refresh failed:', error);
          // Still refresh the page
          setTimeout(() => {
            router.refresh();
          }, 500);
        });
    }
  }, [router, session, status, update]);

  // This component doesn't render anything
  return null;
}
