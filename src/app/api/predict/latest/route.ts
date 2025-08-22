import { NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'

export async function GET() {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const predictions = await db.getLatestPredictions(10)
    
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
      predictions: formattedPredictions,
      metadata: {
        total_predictions: formattedPredictions.length,
        last_updated: formattedPredictions[0]?.created_at || null,
        source: 'production_ml_model'
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
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}
