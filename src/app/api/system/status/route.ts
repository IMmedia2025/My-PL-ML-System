import { NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import fs from 'fs'

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

    // Check ML model
    try {
      const modelPath = './data/models/model.json'
      systemChecks.ml_model = fs.existsSync(modelPath)
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

    // Check data freshness (predictions from last 24 hours)
    try {
      const fetcher = new RealFPLDataFetcher()
      const db = await fetcher.getDatabase()
      const recentPredictions = await db.getLatestPredictions(1)
      
      if (recentPredictions.length > 0) {
        const lastPrediction = new Date(recentPredictions[0].created_at)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
        systemChecks.data_freshness = lastPrediction > twentyFourHoursAgo
      }
    } catch (error) {
      console.error('Data freshness check failed:', error)
    }

    const allSystemsOperational = Object.values(systemChecks).every(status => status)
    const operationalCount = Object.values(systemChecks).filter(status => status).length

    return NextResponse.json({
      status: allSystemsOperational ? 'Fully Operational' : 
              operationalCount >= 2 ? 'Partially Operational' : 'Degraded',
      timestamp: new Date().toISOString(),
      components: systemChecks,
      health_score: `${operationalCount}/4`,
      uptime: process.uptime(),
      system_type: 'Production ML System'
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
