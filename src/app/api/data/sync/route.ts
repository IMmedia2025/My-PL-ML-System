import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'

async function syncHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`Data sync requested by API key: ${auth.apiKey.name}`)
    
    const fetcher = new RealFPLDataFetcher()
    const result = await fetcher.fetchAllData()
    
    // Save sync record to database for tracking
    try {
      const db = await fetcher.getDatabase()
      await db.saveSyncRecord({
        success: result.success,
        teams_count: result.data.bootstrap?.teams?.length || 0,
        players_count: result.data.bootstrap?.players?.length || 0,
        fixtures_count: result.data.fixtures?.length || 0,
        current_gameweek: result.data.currentGameweek || 'Unknown',
        errors: result.errors,
        api_key_name: auth.apiKey.name
      })
      console.log('✅ Sync record saved to database')
    } catch (saveError) {
      console.error('❌ Failed to save sync record:', saveError)
    }
    
    return NextResponse.json({
      success: result.success,
      message: result.success ? 'FPL data synchronized successfully' : 'Data sync completed with errors',
      data: {
        teams: result.data.bootstrap?.teams?.length || 0,
        players: result.data.bootstrap?.players?.length || 0,
        fixtures: result.data.fixtures?.length || 0,
        currentGameweek: result.data.currentGameweek || 'Unknown'
      },
      errors: result.errors,
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Data sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Data synchronization failed', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function syncStatusHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Get actual sync history instead of predictions
    const recentSyncs = await db.getLatestSyncRecords(1)
    const lastSync = recentSyncs.length > 0 ? recentSyncs[0].created_at : null
    
    // Also check for any data in the database
    const teams = await db.getTeamsCount()
    const players = await db.getPlayersCount()
    const fixtures = await db.getFixturesCount()
    
    return NextResponse.json({
      success: true,
      syncStatus: {
        lastSyncTime: lastSync,
        nextScheduledSync: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        autoSyncEnabled: true,
        systemReady: true,
        dataInDatabase: {
          teams: teams,
          players: players,
          fixtures: fixtures
        }
      },
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get sync status', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(syncHandler)
export const GET = withAuth(syncStatusHandler)
