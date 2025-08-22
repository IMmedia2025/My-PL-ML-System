import { NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { ProductionMLModel } from '@/lib/ml/production-model'

export async function POST() {
  try {
    console.log('Generating real predictions...')
    
    // Initialize data and model
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    const model = new ProductionMLModel(db)
    
    // Generate predictions for upcoming matches
    const predictions = await model.predictAllUpcomingMatches()
    
    console.log(`Generated ${predictions.length} real predictions`)
    
    return NextResponse.json({
      success: true,
      message: `Generated ${predictions.length} predictions from trained ML model`,
      predictions: predictions.map(p => ({
        homeTeam: p.home_team_name,
        awayTeam: p.away_team_name,
        prediction: p.predicted_outcome,
        confidence: Math.round(p.confidence * 100),
        gameweek: p.gameweek,
        kickoff_time: p.kickoff_time,
        probabilities: {
          home_win: Math.round(p.home_win_prob * 100),
          draw: Math.round(p.draw_prob * 100),
          away_win: Math.round(p.away_win_prob * 100)
        }
      })),
      metadata: {
        model_version: '1.0.0',
        total_predictions: predictions.length,
        generated_at: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Prediction generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Prediction generation failed', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}
