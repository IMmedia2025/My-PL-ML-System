import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { ProductionMLModel } from '@/lib/ml/production-model'
import { withAuth } from '@/lib/middleware/api-auth'

async function generateHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`Prediction generation requested by API key: ${auth.apiKey.name}`)
    
    // Initialize data and model
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    const model = new ProductionMLModel(db)
    
    // Get all upcoming fixtures
    const allFixtures = await db.getAllFixtures()
    console.log(`Total fixtures in database: ${allFixtures.length}`)
    
    // Filter for current gameweek and upcoming fixtures
    const upcomingFixtures = allFixtures.filter(fixture => {
      return !fixture.finished && fixture.team_h && fixture.team_a
    })
    
    console.log(`Found ${upcomingFixtures.length} upcoming fixtures`)
    
    if (upcomingFixtures.length === 0) {
      console.log('No upcoming fixtures available for prediction')
      return NextResponse.json({
        success: true,
        message: 'No upcoming fixtures available for prediction',
        predictions: [],
        metadata: {
          model_version: '1.0.0',
          total_predictions: 0,
          total_fixtures_in_db: allFixtures.length,
          upcoming_fixtures_found: 0,
          generated_at: new Date().toISOString(),
          api_key: auth.apiKey.name
        }
      })
    }
    
    // Generate predictions for real upcoming matches only
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
        total_fixtures_in_db: allFixtures.length,
        generated_at: new Date().toISOString(),
        api_key: auth.apiKey.name
      }
    })

  } catch (error) {
    console.error('Prediction generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to generate predictions', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function generateStatusHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log('Prediction status check requested')
    
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Get recent predictions
    const recentPredictions = await db.getLatestPredictions(10)
    const upcomingFixtures = await db.getUpcomingFixtures(10)
    
    return NextResponse.json({
      success: true,
      status: {
        totalPredictions: recentPredictions.length,
        upcomingFixtures: upcomingFixtures.length,
        lastGenerationTime: recentPredictions.length > 0 ? recentPredictions[0].created_at : null,
        systemReady: true
      },
      recentPredictions: recentPredictions.slice(0, 5).map(p => ({
        homeTeam: p.home_team_name,
        awayTeam: p.away_team_name,
        prediction: p.predicted_outcome,
        confidence: Math.round(p.confidence * 100),
        gameweek: p.gameweek
      })),
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Prediction status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get prediction status', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(generateHandler)
export const GET = withAuth(generateStatusHandler)
