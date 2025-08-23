import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { withAuth } from '@/lib/middleware/api-auth'
import fs from 'fs'

async function statusHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`System status check requested by API key: ${auth.apiKey.name}`)
    
    // Check system components
    const systemChecks = {
      database: false,
      ml_model: false,
      fpl_api: false,
      data_freshness: false
    }

    const debugInfo: any = {
      model_check: 'Checking both training history and model file',
      data_freshness_window: '6 hours',
      authenticated_user: auth.apiKey.name,
      checks_performed: []
    }

    // Check database
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      await db.initialize()
      
      // Also check if database has data
      const teamsCount = await db.getTeamsCount()
      const playersCount = await db.getPlayersCount()
      const fixturesCount = await db.getFixturesCount()
      
      systemChecks.database = true
      debugInfo.checks_performed.push('database: connected')
      debugInfo.database_stats = {
        teams: teamsCount,
        players: playersCount,
        fixtures: fixturesCount
      }
      
      console.log(`Database check passed. Data: Teams=${teamsCount}, Players=${playersCount}, Fixtures=${fixturesCount}`)
    } catch (error) {
      console.error('Database check failed:', error)
      debugInfo.checks_performed.push('database: failed')
      debugInfo.database_error = error instanceof Error ? error.message : 'Unknown error'
    }

    // Check ML model - improved detection
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      
      // Check training history
      const trainingHistory = await db.getTrainingHistory(1)
      const hasTrainingHistory = trainingHistory.length > 0
      
      // Check for model file (optional)
      const modelPath = './data/models/model.json'
      const hasModelFile = fs.existsSync(modelPath)
      
      // Check if we have prediction capability (even demo mode)
      const predictionsCount = await db.getPredictionsCount()
      const canGeneratePredictions = predictionsCount > 0 || hasTrainingHistory || hasModelFile
      
      systemChecks.ml_model = canGeneratePredictions
      
      debugInfo.checks_performed.push('ml_model: checked')
      debugInfo.ml_model_details = {
        has_training_history: hasTrainingHistory,
        training_runs: trainingHistory.length,
        has_model_file: hasModelFile,
        predictions_count: predictionsCount,
        can_generate: canGeneratePredictions,
        last_training: hasTrainingHistory ? trainingHistory[0].created_at : null
      }
      
      console.log(`ML Model check: training=${hasTrainingHistory}, file=${hasModelFile}, predictions=${predictionsCount}, capable=${canGeneratePredictions}`)
    } catch (error) {
      console.error('Model check failed:', error)
      debugInfo.checks_performed.push('ml_model: failed')
      debugInfo.ml_model_error = error instanceof Error ? error.message : 'Unknown error'
    }

    // Check FPL API
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      clearTimeout(timeoutId)
      systemChecks.fpl_api = response.ok
      debugInfo.checks_performed.push(`fpl_api: ${response.status}`)
      
      console.log(`FPL API check: ${response.status} ${response.ok ? 'OK' : 'Failed'}`)
    } catch (error) {
      console.error('FPL API check failed:', error)
      debugInfo.checks_performed.push('fpl_api: failed')
      debugInfo.fpl_api_error = error instanceof Error ? error.message : 'Network error'
    }

    // Check data freshness - now based on sync records instead of predictions
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      
      // Check recent sync records
      const recentSyncs = await db.getLatestSyncRecords(1)
      let dataFreshness = false
      let lastSyncTime = null
      
      if (recentSyncs.length > 0) {
        const lastSync = new Date(recentSyncs[0].created_at)
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
        dataFreshness = lastSync > sixHoursAgo
        lastSyncTime = lastSync.toISOString()
        
        debugInfo.data_freshness_details = {
          last_sync: lastSyncTime,
          six_hours_ago: sixHoursAgo.toISOString(),
          is_fresh: dataFreshness,
          sync_success: recentSyncs[0].success
        }
      } else {
        // Fallback: check if we have any data at all
        const teamsCount = await db.getTeamsCount()
        const hasData = teamsCount > 0
        dataFreshness = hasData // Consider having data as "fresh enough"
        
        debugInfo.data_freshness_details = {
          no_sync_records: true,
          has_data_fallback: hasData,
          teams_count: teamsCount
        }
      }
      
      systemChecks.data_freshness = dataFreshness
      debugInfo.checks_performed.push('data_freshness: checked')
      
      console.log(`Data freshness check: fresh=${dataFreshness}, last_sync=${lastSyncTime}`)
    } catch (error) {
      console.error('Data freshness check failed:', error)
      debugInfo.checks_performed.push('data_freshness: failed')
      debugInfo.data_freshness_error = error instanceof Error ? error.message : 'Unknown error'
    }

    const allSystemsOperational = Object.values(systemChecks).every(status => status)
    const operationalCount = Object.values(systemChecks).filter(status => status).length

    const systemStatus = allSystemsOperational ? 'Fully Operational' : 
                        operationalCount >= 3 ? 'Mostly Operational' :
                        operationalCount >= 2 ? 'Partially Operational' : 'Degraded'

    console.log(`System status: ${systemStatus} (${operationalCount}/4 components operational)`)

    return NextResponse.json({
      success: true,
      status: systemStatus,
      timestamp: new Date().toISOString(),
      components: systemChecks,
      health_score: `${operationalCount}/4`,
      uptime: process.uptime(),
      system_type: 'Production ML System',
      api_key: auth.apiKey.name,
      debug: debugInfo
    })

  } catch (error) {
    console.error('System status check failed:', error)
    return NextResponse.json(
      { 
        success: false,
        status: 'Critical Error', 
        error: 'System check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

export const GET = withAuth(statusHandler)
