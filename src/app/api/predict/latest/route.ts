import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function latestPredictionsHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
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

    return NextResponse.json({
      success: true,
      data: formattedPredictions,
      metadata: {
        total_predictions: formattedPredictions.length,
        last_updated: formattedPredictions[0]?.created_at || null,
        source: 'production_ml_model',
        api_key: auth.apiKey.name,
        rate_limit: {
          limit: auth.apiKey.rate_limit,
          window: '1 hour'
        }
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Latest predictions fetch error:', error)
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
  }
}

export const GET = withAuth(latestPredictionsHandler)
