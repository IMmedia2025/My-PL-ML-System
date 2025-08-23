import { NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    // Check system components
    const systemChecks = {
      database: false,
      ml_model: false,
      fpl_api: false,
      data_freshness: false
    }

    // Check database
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      await db.initialize()
      systemChecks.database = true
    } catch (error) {
      console.error('Database check failed:', error)
    }

    // Check ML model - Check both file and training history
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      
      // Check if we have any successful training runs
      const trainingHistory = await db.getTrainingHistory(1)
      const hasTrainingHistory = trainingHistory.length > 0
      
      // Check for model file (optional)
      const modelPath = './data/models/model.json'
      const hasModelFile = fs.existsSync(modelPath)
      
      // Model is considered available if we have training history OR model file
      systemChecks.ml_model = hasTrainingHistory || hasModelFile
      
      console.log(`Model check: trainingHistory=${hasTrainingHistory}, modelFile=${hasModelFile}`)
    } catch (error) {
      console.error('Model check failed:', error)
    }

    // Check FPL API
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      clearTimeout(timeoutId)
      systemChecks.fpl_api = response.ok
    } catch (error) {
      console.error('FPL API check failed:', error)
    }

    // Check data freshness (predictions from last 6 hours, not 24)
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      const recentPredictions = await db.getLatestPredictions(1)
      
      if (recentPredictions.length > 0) {
        const lastPrediction = new Date(recentPredictions[0].created_at)
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000) // 6 hours instead of 24
        systemChecks.data_freshness = lastPrediction > sixHoursAgo
        
        console.log(`Data freshness: lastPrediction=${lastPrediction.toISOString()}, sixHoursAgo=${sixHoursAgo.toISOString()}`)
      } else {
        console.log('No predictions found for data freshness check')
      }
    } catch (error) {
      console.error('Data freshness check failed:', error)
    }

    const allSystemsOperational = Object.values(systemChecks).every(status => status)
    const operationalCount = Object.values(systemChecks).filter(status => status).length

    return NextResponse.json({
      status: allSystemsOperational ? 'Fully Operational' : 
              operationalCount >= 3 ? 'Mostly Operational' :
              operationalCount >= 2 ? 'Partially Operational' : 'Degraded',
      timestamp: new Date().toISOString(),
      components: systemChecks,
      health_score: `${operationalCount}/4`,
      uptime: process.uptime(),
      system_type: 'Production ML System',
      debug: {
        model_check: 'Checking both training history and model file',
        data_freshness_window: '6 hours'
      }
    })

  } catch (error) {
    console.error('System status check failed:', error)
    return NextResponse.json(
      { 
        status: 'Critical Error', 
        error: 'System check failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
