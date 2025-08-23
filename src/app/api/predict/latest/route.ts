import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function latestPredictionsHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`🔍 Latest predictions requested by API key: ${auth.apiKey.name}`)
    
    // Get predictions
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50) // Max 50 results
    
    console.log(`📊 Fetching ${limit} latest predictions...`)
    
    // First, let's check what tables exist in the database
    const tableCheck = await new Promise<any[]>((resolve) => {
      (db as any).db.all(`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name LIKE '%prediction%'
      `, (err: any, rows: any[]) => {
        if (err) {
          console.error('Error checking tables:', err)
          resolve([])
        } else {
          resolve(rows || [])
        }
      })
    })

    console.log('🏗️ Prediction tables found:', tableCheck.map(t => t.name))
    
    // Get predictions count first
    const totalPredictions = await db.getPredictionsCount()
    console.log(`📈 Total predictions in database: ${totalPredictions}`)
    
    // Get latest predictions
    const predictions = await db.getLatestPredictions(limit)
    console.log(`✅ Found ${predictions.length} recent predictions`)
    
    // If no predictions found, let's check if we need to generate some
    if (predictions.length === 0) {
      console.log('⚠️ No predictions found. Checking system status...')
      
      // Check if we have basic data
      const teamsCount = await db.getTeamsCount()
      const playersCount = await db.getPlayersCount()
      const fixturesCount = await db.getFixturesCount()
      
      console.log(`📊 Database stats: Teams=${teamsCount}, Players=${playersCount}, Fixtures=${fixturesCount}`)
      
      // Check if we have training history
      const trainingHistory = await db.getTrainingHistory(1)
      const hasTraining = trainingHistory.length > 0
      
      console.log(`🧠 Training history: ${hasTraining ? 'Available' : 'None'}`)
      
      // Provide guidance on what needs to be done
      const guidance: string[] = []
      let nextStep = ''
      
      if (teamsCount === 0 || playersCount === 0 || fixturesCount === 0) {
        guidance.push('1. Sync FPL data first: POST /api/data/sync')
        nextStep = 'sync_data'
      } else if (!hasTraining) {
        guidance.push('1. ✅ Data is synced')
        guidance.push('2. Train the ML model: POST /api/train/production')
        nextStep = 'train_model'
      } else {
        guidance.push('1. ✅ Data is synced')
        guidance.push('2. ✅ Model is trained')
        guidance.push('3. Generate predictions: POST /api/predict/generate')
        nextStep = 'generate_predictions'
      }

      return NextResponse.json({
        success: true,
        data: [],
        predictions: [],
        metadata: {
          total_predictions: 0,
          total_predictions_in_db: totalPredictions,
          last_updated: null,
          source: 'production_ml_model',
          api_key: auth.apiKey.name,
          rate_limit: {
            limit: auth.apiKey.rate_limit,
            window: '1 hour'
          }
        },
        system_status: {
          has_data: teamsCount > 0 && playersCount > 0 && fixturesCount > 0,
          has_training: hasTraining,
          has_predictions: totalPredictions > 0,
          next_step: nextStep,
          database_stats: {
            teams: teamsCount,
            players: playersCount,
            fixtures: fixturesCount,
            predictions: totalPredictions
          }
        },
        guidance: guidance,
        help: {
          message: "No predictions available yet. Follow the steps above to get started.",
          documentation: {
            sync_data: "POST /api/data/sync - Downloads teams, players, and fixtures from FPL API",
            train_model: "POST /api/train/production - Trains the ML model using historical data",
            generate_predictions: "POST /api/predict/generate - Creates predictions for upcoming matches"
          }
        },
        timestamp: new Date().toISOString()
      })
    }
    
    // Format predictions for response
    const formattedPredictions = predictions.map(p => ({
      homeTeam: p.home_team_name || 'Unknown',
      awayTeam: p.away_team_name || 'Unknown',
      prediction: p.predicted_outcome || 'Unknown',
      confidence: Math.round((p.confidence || 0) * 100),
      gameweek: p.gameweek || 0,
      kickoff_time: p.kickoff_time,
      probabilities: {
        home_win: Math.round((p.home_win_prob || 0) * 100),
        draw: Math.round((p.draw_prob || 0) * 100),
        away_win: Math.round((p.away_win_prob || 0) * 100)
      },
      model_version: p.model_version || '1.0.0',
      created_at: p.created_at
    }))

    console.log(`✅ Returning ${formattedPredictions.length} formatted predictions`)

    return NextResponse.json({
      success: true,
      data: formattedPredictions,
      predictions: formattedPredictions, // For backward compatibility
      metadata: {
        total_predictions: formattedPredictions.length,
        total_predictions_in_db: totalPredictions,
        last_updated: formattedPredictions[0]?.created_at || null,
        source: 'production_ml_model',
        model_version: formattedPredictions[0]?.model_version || '1.0.0',
        api_key: auth.apiKey.name,
        rate_limit: {
          limit: auth.apiKey.rate_limit,
          window: '1 hour'
        }
      },
      system_status: {
        has_predictions: true,
        predictions_available: formattedPredictions.length,
        last_generated: formattedPredictions[0]?.created_at || null,
        system_healthy: true
      },
      debug_info: {
        requested_limit: limit,
        found_predictions: predictions.length,
        total_in_database: totalPredictions,
        database_connection: 'active',
        table_exists: true,
        query_successful: true,
        tables_found: tableCheck.map(t => t.name)
      },
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('❌ Latest predictions fetch error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch latest predictions', 
        details: errorMessage,
        help: {
          message: "There was a database or system error. This might be a temporary issue.",
          troubleshooting: [
            "1. Check if the database file exists and has proper permissions",
            "2. Ensure the database tables are created properly",
            "3. Try regenerating data: POST /api/data/sync",
            "4. Check server logs for more detailed error information"
          ]
        },
        debug_info: {
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
          database_connection: 'error',
          query_successful: false,
          timestamp: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(latestPredictionsHandler)
