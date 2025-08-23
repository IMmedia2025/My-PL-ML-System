import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { authenticateApiKey, logApiRequest } from '@/lib/middleware/api-auth'

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  let statusCode = 200
  let apiKey: any = null

  try {
    // Authenticate API key
    const auth = await authenticateApiKey(request)
    
    if (!auth.authenticated) {
      statusCode = 401
      return NextResponse.json(
        { 
          success: false, 
          error: 'Authentication required',
          message: auth.error,
          help: {
            required_header: 'x-api-key',
            get_api_key: 'Contact admin to get an API key',
            example: 'curl -H "x-api-key: your_key_here" https://your-domain.com/api/predict/latest'
          },
          timestamp: new Date().toISOString()
        },
        { status: 401 }
      )
    }

    apiKey = auth.apiKey

    // Get predictions
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50) // Max 50 results
    
    const predictions = await db.getLatestPredictions(limit)
    
    const formattedPredictions = predictions.map(p => ({
      homeTeam: p.home_team_name || 'Unknown',
      awayTeam: p.away_team_name || 'Unknown',
      prediction: p.predicted_outcome,
      confidence: Math.round(p.confidence * 100),
      gameweek: p.gameweek,
      kickoff_time: p.kickoff_time,
      probabilities: {
        home_win: Math.round(p.home_win_prob * 100),
        draw: Math.round(p.draw_prob * 100),
        away_win: Math.round(p.away_win_prob * 100)
      },
      created_at: p.created_at
    }))

    const response = NextResponse.json({
      success: true,
      data: formattedPredictions,
      metadata: {
        total_predictions: formattedPredictions.length,
        last_updated: formattedPredictions[0]?.created_at || null,
        source: 'production_ml_model',
        api_key: apiKey.name,
        rate_limit: {
          limit: apiKey.rate_limit,
          window: '1 hour'
        }
      },
      timestamp: new Date().toISOString()
    })

    return response

  } catch (error) {
    console.error('Latest predictions fetch error:', error)
    statusCode = 500
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch latest predictions', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  } finally {
    // Log API usage if we have an API key
    if (apiKey) {
      logApiRequest(
        apiKey,
        '/api/predict/latest',
        'GET',
        statusCode,
        startTime,
        request
      ).catch(err => console.error('Failed to log API usage:', err))
    }
  }
}
