// components/PerformanceMonitor.tsx
// Professional performance monitoring component
'use client';

import { useEffect, useState } from 'react';

import { networkRecoveryService } from '@/lib/network-recovery';
import { webVitalsService } from '@/lib/web-vitals';

interface PerformanceData {
  webVitals: {
    CLS?: number;
    FID?: number;
    FCP?: number;
    LCP?: number;
    TTFB?: number;
    INP?: number;
  };
  performanceScore: number;
  networkStatus: {
    isOnline: boolean;
    isSlowConnection: boolean;
    connectionType?: string;
  };
  offlineQueue: {
    size: number;
    items: Array<{ id: string; timestamp: number; retryCount: number }>;
  };
}

export function PerformanceMonitor() {
  const [performanceData, setPerformanceData] =
    useState<PerformanceData | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Update performance data every 5 seconds
    const interval = setInterval(() => {
      const webVitals = webVitalsService.getWebVitalsMetrics();
      const performanceScore = webVitalsService.getPerformanceScore();
      const networkStatus = networkRecoveryService.getNetworkStatus();
      const offlineQueue = networkRecoveryService.getOfflineQueueStatus();

      setPerformanceData({
        webVitals,
        performanceScore,
        networkStatus,
        offlineQueue,
      });
    }, 5000);

    // Initial data load
    const webVitals = webVitalsService.getWebVitalsMetrics();
    const performanceScore = webVitalsService.getPerformanceScore();
    const networkStatus = networkRecoveryService.getNetworkStatus();
    const offlineQueue = networkRecoveryService.getOfflineQueueStatus();

    setPerformanceData({
      webVitals,
      performanceScore,
      networkStatus,
      offlineQueue,
    });

    return () => clearInterval(interval);
  }, []);

  if (!performanceData) {
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-100';
    if (score >= 70) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatMetric = (value: number | undefined, unit: string = 'ms') => {
    if (value === undefined) return 'N/A';
    return `${Math.round(value)}${unit}`;
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className='fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors'
        title='Performance Monitor'
      >
        <svg
          className='w-5 h-5'
          fill='none'
          stroke='currentColor'
          viewBox='0 0 24 24'
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth={2}
            d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
          />
        </svg>
      </button>

      {/* Performance Panel */}
      {isVisible && (
        <div className='fixed bottom-20 right-4 z-50 bg-white rounded-lg shadow-xl border max-w-sm w-full'>
          <div className='p-4 border-b'>
            <div className='flex items-center justify-between'>
              <h3 className='text-lg font-semibold text-gray-900'>
                Performance Monitor
              </h3>
              <button
                onClick={() => setIsVisible(false)}
                className='text-gray-400 hover:text-gray-600'
              >
                <svg
                  className='w-5 h-5'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M6 18L18 6M6 6l12 12'
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className='p-4 space-y-4'>
            {/* Performance Score */}
            <div>
              <div className='flex items-center justify-between mb-2'>
                <span className='text-sm font-medium text-gray-600'>
                  Performance Score
                </span>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(performanceData.performanceScore)}`}
                >
                  {Math.round(performanceData.performanceScore)}/100
                </span>
              </div>
            </div>

            {/* Web Vitals */}
            <div>
              <h4 className='text-sm font-medium text-gray-900 mb-2'>
                Web Vitals
              </h4>
              <div className='grid grid-cols-2 gap-2 text-xs'>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>CLS:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.CLS)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>FID:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.FID)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>FCP:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.FCP)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>LCP:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.LCP)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>TTFB:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.TTFB)}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-gray-600'>INP:</span>
                  <span className='font-mono'>
                    {formatMetric(performanceData.webVitals.INP)}
                  </span>
                </div>
              </div>
            </div>

            {/* Network Status */}
            <div>
              <h4 className='text-sm font-medium text-gray-900 mb-2'>
                Network Status
              </h4>
              <div className='space-y-1 text-xs'>
                <div className='flex items-center justify-between'>
                  <span className='text-gray-600'>Status:</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      performanceData.networkStatus.isOnline
                        ? 'text-green-600 bg-green-100'
                        : 'text-red-600 bg-red-100'
                    }`}
                  >
                    {performanceData.networkStatus.isOnline
                      ? 'Online'
                      : 'Offline'}
                  </span>
                </div>
                {performanceData.networkStatus.connectionType && (
                  <div className='flex justify-between'>
                    <span className='text-gray-600'>Connection:</span>
                    <span className='font-mono'>
                      {performanceData.networkStatus.connectionType}
                    </span>
                  </div>
                )}
                {performanceData.networkStatus.isSlowConnection && (
                  <div className='text-yellow-600 text-xs'>
                    ⚠️ Slow connection detected
                  </div>
                )}
              </div>
            </div>

            {/* Offline Queue */}
            {performanceData.offlineQueue.size > 0 && (
              <div>
                <h4 className='text-sm font-medium text-gray-900 mb-2'>
                  Offline Queue
                </h4>
                <div className='text-xs text-gray-600'>
                  {performanceData.offlineQueue.size} operations pending
                </div>
              </div>
            )}

            {/* Actions */}
            <div className='pt-2 border-t'>
              <button
                onClick={() => {
                  webVitalsService.markTiming('manual-refresh');
                  window.location.reload();
                }}
                className='w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors'
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
