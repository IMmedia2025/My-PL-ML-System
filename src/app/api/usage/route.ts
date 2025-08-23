import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function usageHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '30')
    const limit = Math.min(Math.max(days, 1), 90) // Between 1 and 90 days

    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()

    // Get usage statistics
    const dailyStats = await db.getApiKeyUsageStats(auth.apiKey.id, limit)

    // Calculate totals
    const totalRequests = dailyStats.reduce((sum, day) => sum + (day.total_requests || 0), 0)
    const totalSuccessful = dailyStats.reduce((sum, day) => sum + (day.successful_requests || 0), 0)
    const totalFailed = dailyStats.reduce((sum, day) => sum + (day.failed_requests || 0), 0)
    const avgResponseTime = dailyStats.length > 0 
      ? dailyStats.reduce((sum, day) => sum + (day.avg_response_time_ms || 0), 0) / dailyStats.length 
      : 0

    // Get rate limit info
    const rateLimit = {
      limit: auth.apiKey.rate_limit || 1000,
      window: '1 hour',
      remaining: Math.max(0, (auth.apiKey.rate_limit || 1000) - totalRequests)
    }

    return NextResponse.json({
      success: true,
      data: {
        apiKey: {
          id: auth.apiKey.id,
          name: auth.apiKey.name,
          created_at: auth.apiKey.created_at,
          last_used_at: auth.apiKey.last_used_at
        },
        summary: {
          total_requests: totalRequests,
          successful_requests: totalSuccessful,
          failed_requests: totalFailed,
          success_rate: totalRequests > 0 ? ((totalSuccessful / totalRequests) * 100).toFixed(2) + '%' : '0%',
          avg_response_time_ms: Math.round(avgResponseTime),
          period_days: limit
        },
        rate_limit: rateLimit,
        daily_stats: dailyStats.map(day => ({
          date: day.date,
          total_requests: day.total_requests || 0,
          successful_requests: day.successful_requests || 0,
          failed_requests: day.failed_requests || 0,
          success_rate: day.total_requests > 0 
            ? ((day.successful_requests / day.total_requests) * 100).toFixed(1) + '%' 
            : '0%',
          avg_response_time_ms: Math.round(day.avg_response_time_ms || 0)
        }))
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error getting usage statistics:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get usage statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(usageHandler)
