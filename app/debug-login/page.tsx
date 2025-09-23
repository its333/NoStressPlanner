'use client';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { debugLog } from '@/lib/debug';

export default function LoginDebugPage() {
  const { data: session, status } = useSession();
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logEntry]);
    debugLog('LoginDebugPage: log entry', { message: logEntry });
  };

  useEffect(() => {
    addLog(`Session status changed: ${status}`);
    addLog(`Session data: ${JSON.stringify(session, null, 2)}`);

    // Collect comprehensive debug information
    const info = {
      sessionStatus: status,
      sessionData: session,
      cookies: typeof document !== 'undefined' ? document.cookie : 'N/A',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
      timestamp: new Date().toISOString(),
    };

    setDebugInfo(info);
    addLog(`Debug info updated`);
  }, [session, status]);

  const testSessionEndpoint = async () => {
    addLog('Testing server session endpoint...');
    try {
      const response = await fetch('/api/debug/session');
      const data = await response.json();
      addLog(`Server session response received`);
      setDebugInfo((prev: any) => ({ ...prev, serverSession: data }));
    } catch (error) {
      addLog(`Session test failed: ${error}`);
      console.error('Session test failed:', error);
    }
  };

  return (
    <div className='container-page p-6'>
      <h1 className='text-2xl font-bold mb-4'>🔍 Login Debug Page</h1>

      <div className='grid gap-4'>
        {/* Real-time Status */}
        <div className='p-4 border rounded bg-blue-50'>
          <h2 className='text-lg font-semibold mb-2'>📊 Session Status</h2>
          <p>
            <strong>Status:</strong>{' '}
            <span
              className={`font-bold ${status === 'authenticated' ? 'text-green-600' : status === 'loading' ? 'text-yellow-600' : 'text-red-600'}`}
            >
              {status}
            </span>
          </p>
          <p>
            <strong>Has Session:</strong> {session ? '✅ Yes' : '❌ No'}
          </p>
          {session && (
            <div className='mt-2 p-2 bg-green-100 rounded'>
              <p>
                <strong>User ID:</strong> {session.user?.id}
              </p>
              <p>
                <strong>Name:</strong> {session.user?.name}
              </p>
              <p>
                <strong>Email:</strong> {session.user?.email}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className='p-4 border rounded'>
          <h2 className='text-lg font-semibold mb-2'>🔧 Debug Actions</h2>
          <div className='flex flex-wrap gap-2'>
            <button onClick={testSessionEndpoint} className='btn-primary'>
              Test Server Session
            </button>
            <button onClick={() => window.location.reload()} className='btn'>
              Reload Page
            </button>
          </div>
        </div>

        {/* Live Logs */}
        <div className='p-4 border rounded'>
          <h2 className='text-lg font-semibold mb-2'>📝 Debug Logs</h2>
          <div className='bg-black text-green-400 p-3 rounded font-mono text-xs max-h-60 overflow-y-auto'>
            {logs.length === 0 ? (
              <div className='text-gray-500'>No logs yet...</div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className='mb-1'>
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Debug Info */}
        {debugInfo && (
          <div className='p-4 border rounded'>
            <h2 className='text-lg font-semibold mb-2'>🔍 Debug Information</h2>
            <pre className='text-xs bg-gray-100 p-3 rounded overflow-auto max-h-96'>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
