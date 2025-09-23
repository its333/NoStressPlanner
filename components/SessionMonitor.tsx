'use client';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { debugLog } from '@/lib/debug';

/**
 * Comprehensive session monitoring component
 * Logs all session changes and provides detailed debugging information
 */
export function SessionMonitor() {
  const { data: session, status, update } = useSession();

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    const logSessionChange = () => {
      const timestamp = new Date().toISOString();
      const logData = {
        timestamp,
        status,
        hasSession: !!session,
        sessionData: session,
        cookies: document.cookie,
        url: window.location.href,
        userAgent: navigator.userAgent,
        sessionExpiry: session?.expires,
        isExpired: session?.expires
          ? new Date() > new Date(session.expires)
          : false,
      };

      debugLog('SessionMonitor: session change detected', logData);

      // Also log to a global variable for easy access
      (window as any).lastSessionLog = logData;
      (window as any).sessionLogs = (window as any).sessionLogs || [];
      (window as any).sessionLogs.push(logData);

      // Keep only last 10 logs
      if ((window as any).sessionLogs.length > 10) {
        (window as any).sessionLogs = (window as any).sessionLogs.slice(-10);
      }
    };

    logSessionChange();
  }, [session, status]);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Monitor for cookie changes - reduced frequency
    const checkCookies = () => {
      const currentCookies = document.cookie;
      if (currentCookies !== (window as any).lastCookieCheck) {
        debugLog('SessionMonitor: cookie change detected', {
          cookies: currentCookies,
        });
        (window as any).lastCookieCheck = currentCookies;
      }
    };

    // Check cookies every 10 seconds (reduced from 2 seconds)
    const interval = setInterval(checkCookies, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') return;

    // Monitor URL changes
    const handleUrlChange = () => {
      debugLog('SessionMonitor: URL change detected', {
        url: window.location.href,
      });
    };

    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('pushstate', handleUrlChange);
    window.addEventListener('replacestate', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('pushstate', handleUrlChange);
      window.removeEventListener('replacestate', handleUrlChange);
    };
  }, []);

  // Add global debugging functions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    (window as any).debugSession = {
      getCurrentSession: () => ({ session, status }),
      getLogs: () => (window as any).sessionLogs || [],
      clearLogs: () => {
        (window as any).sessionLogs = [];
      },
      forceUpdate: () => update(),
      getCookies: () => document.cookie,
      clearCookies: () => {
        document.cookie.split(';').forEach(function (c) {
          document.cookie = c
            .replace(/^ +/, '')
            .replace(
              /=.*/,
              '=;expires=' + new Date().toUTCString() + ';path=/'
            );
        });
      },
      testAuth: async () => {
        try {
          const response = await fetch('/api/debug/session');
          const data = await response.json();
          debugLog('SessionMonitor: auth test result', data);
          return data;
        } catch (error) {
          console.error('❌ Auth Test Failed:', error);
          return {
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    };
  }, [session, status, update]);

  // This component doesn't render anything visible
  return null;
}
