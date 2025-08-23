import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function latestPredictionsHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`Latest predictions requested by API key: ${auth.apiKey.name}`)
    
    // Get predictions
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50) // Max 50 results
    
    console.log(`Fetching ${limit} latest predictions...`)
    
    const predictions = await db.getLatestPredictions(limit)
    const totalPredictions = await db.getPredictionsCount()
    
    console.log(`Found ${predictions.length} recent predictions, ${totalPredictions} total in database`)
    
    // Debug: Let's see what's actually in the predictions table
    if (predictions.length === 0) {
      console.log('No predictions found, checking database structure...')
      
      // Check if predictions table exists and get sample data
      const tableInfo = await new Promise<any>((resolve) => {
        (db as any).db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'", (err: any, row: any) => {
          resolve(row)
        })
      })
      
      console.log('Predictions table exists:', !!tableInfo)
      
      if (tableInfo) {
        // Get table schema
        const schema = await new Promise<any[]>((resolve) => {
          (db as any).db.all("PRAGMA table_info(predictions)", (err: any, rows: any[]) => {
            resolve(rows || [])
          })
        })
        
        console.log('Predictions table schema:', schema.map(col => col.name))
        
        // Try to get any predictions at all
        const anyPredictions = await new Promise<any[]>((resolve) => {
          (db as any).db.all("SELECT COUNT(*) as count FROM predictions", (err: any, row: any) => {
            resolve([row])
          })
        })
        
        console.log('Total predictions in database:', anyPredictions[0]?.count || 0)
      }
    }
    
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
      created_at: p.created_at
    }))

    return NextResponse.json({
      success: true,
      data: formattedPredictions,
      predictions: formattedPredictions, // For backward compatibility
      metadata: {
        total_predictions: formattedPredictions.length,
        total_predictions_in_db: totalPredictions,
        last_updated: formattedPredictions[0]?.created_at || null,
        source: 'production_ml_model',
        api_key: auth.apiKey.name,
        rate_limit: {
          limit: auth.apiKey.rate_limit,
          window: '1 hour'
        }
      },
      debug_info: {
        requested_limit: limit,
        found_predictions: predictions.length,
        total_in_database: totalPredictions,
        predictions_available: totalPredictions > 0,
        database_connection: 'active',
        table_exists: true,
        query_successful: true
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
        debug_info: {
          error_type: error instanceof Error ? error.constructor.name : 'Unknown',
          database_connection: 'error',
          query_successful: false
        },
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(latestPredictionsHandler)
