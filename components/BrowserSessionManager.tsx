// components/BrowserSessionManager.tsx
// Client-side component to manage browser-specific sessions

'use client';
import { useEffect, useState } from 'react';

export function BrowserSessionManager() {
  const [browserId, setBrowserId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Generate a unique browser ID that persists across page reloads
    const generateBrowserId = () => {
      // Try to get existing browser ID from localStorage
      let existingId = localStorage.getItem('browser-session-id');
      
      if (existingId) {
        console.log('🔍 Using existing browser ID:', existingId);
        return existingId;
      }
      
      // Generate new browser ID
      const newId = `browser_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      localStorage.setItem('browser-session-id', newId);
      console.log('🔍 Generated new browser ID:', newId);
      return newId;
    };

    const initializeBrowserSession = async () => {
      try {
        const id = generateBrowserId();
        setBrowserId(id);
        
        // Send browser ID to server
        const response = await fetch('/api/debug/browser-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ browserId: id }),
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log('🔍 Browser session initialized:', result);
          setIsInitialized(true);
        } else {
          console.error('❌ Failed to initialize browser session');
        }
      } catch (error) {
        console.error('❌ Error initializing browser session:', error);
      }
    };

    initializeBrowserSession();
  }, []);

  // Add browser ID to all API requests
  useEffect(() => {
    if (!browserId || !isInitialized) return;

    // Intercept fetch requests to add browser ID header
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('X-Browser-Session-ID', browserId);
      
      return originalFetch(input, {
        ...init,
        headers,
      });
    };

    console.log('🔍 Browser session interceptor set up for ID:', browserId);

    // Cleanup
    return () => {
      window.fetch = originalFetch;
    };
  }, [browserId, isInitialized]);

  // This component doesn't render anything visible
  return null;
}
