// app/api/database/analysis/route.ts
// Database analysis endpoint for optimization insights
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { databaseOptimizer } from '@/lib/database-optimizer';
import { logger } from '@/lib/logger';
import { withApiKeyAuth } from '@/lib/auth-middleware';

export const GET = withApiKeyAuth(async (_req: NextRequest) => {
  try {
    const performanceSummary = databaseOptimizer.getQueryPerformanceSummary();
    const optimizationSuggestions = databaseOptimizer.analyzeQueryPerformance();
    
    const response = {
      performance: performanceSummary,
      suggestions: optimizationSuggestions,
      timestamp: new Date().toISOString()
    };

    logger.debug('Database analysis requested', {
      totalQueries: performanceSummary.totalQueries,
      suggestionsCount: optimizationSuggestions.length
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Database analysis failed', { error });
    
    return NextResponse.json({
      error: 'Failed to analyze database performance',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
});
