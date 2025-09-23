// components/ErrorRecoveryBoundary.tsx
// Professional error recovery boundary with user-friendly error handling
'use client';
import React, { Component, ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  onRecovery?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
  isRecovering: boolean;
}

export class ErrorRecoveryBoundary extends Component<Props, State> {
  private maxRetries = 3;
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      retryCount: 0,
      isRecovering: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Error boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // Attempt automatic recovery for certain errors
    this.attemptRecovery(error);
  }

  private attemptRecovery = async (error: Error) => {
    if (this.state.retryCount >= this.maxRetries) {
      logger.error('Maximum retry attempts reached', {
        retryCount: this.state.retryCount,
        maxRetries: this.maxRetries
      });
      return;
    }

    const errorMessage = error.message.toLowerCase();
    
    // Only attempt recovery for certain types of errors
    if (errorMessage.includes('network') || 
        errorMessage.includes('fetch') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection')) {
      
      this.setState({ isRecovering: true });
      
      // Wait before retrying
      const delay = Math.min(1000 * Math.pow(2, this.state.retryCount), 10000);
      
      this.retryTimeout = setTimeout(() => {
        this.setState(prevState => ({
          hasError: false,
          error: null,
          retryCount: prevState.retryCount + 1,
          isRecovering: false
        }));
        
        logger.info('Error recovery attempted', {
          retryCount: this.state.retryCount + 1,
          error: error.message
        });
        
        this.props.onRecovery?.();
      }, delay);
    }
  };

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      retryCount: 0,
      isRecovering: false
    });
    
    logger.info('Manual retry initiated');
    this.props.onRecovery?.();
  };

  private handleReload = () => {
    window.location.reload();
  };

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isRecovering) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 text-center mb-2">
                Recovering...
              </h2>
              <p className="text-gray-600 text-center">
                We're working to fix the issue. Please wait a moment.
              </p>
            </div>
          </div>
        );
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-center mb-4">
              <div className="rounded-full bg-red-100 p-3">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            
            <h2 className="text-lg font-semibold text-gray-900 text-center mb-2">
              Something went wrong
            </h2>
            
            <p className="text-gray-600 text-center mb-6">
              We encountered an unexpected error. Don't worry, we're working to fix it.
            </p>

            {this.state.error && (
              <details className="mb-6">
                <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Error Details
                </summary>
                <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 break-all">
                  {this.state.error.message}
                </div>
              </details>
            )}

            <div className="flex space-x-3">
              <button
                onClick={this.handleRetry}
                disabled={this.state.retryCount >= this.maxRetries}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {this.state.retryCount >= this.maxRetries ? 'Max Retries Reached' : 'Try Again'}
              </button>
              
              <button
                onClick={this.handleReload}
                className="flex-1 bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                Reload Page
              </button>
            </div>

            {this.state.retryCount > 0 && (
              <p className="text-xs text-gray-500 text-center mt-4">
                Retry attempt {this.state.retryCount} of {this.maxRetries}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook for error recovery in functional components
 */
export function useErrorRecovery() {
  const [error, setError] = React.useState<Error | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  const recover = React.useCallback(async () => {
    try {
      setError(null);
      setRetryCount(prev => prev + 1);
      
      // Force a re-render by updating a dummy state
      await new Promise(resolve => setTimeout(resolve, 100));
      
      logger.info('Error recovery completed', { retryCount: retryCount + 1 });
    } catch (err) {
      logger.error('Error recovery failed', { error: err });
    }
  }, [retryCount]);

  const reset = React.useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  return {
    error,
    retryCount,
    recover,
    reset,
    setError
  };
}
