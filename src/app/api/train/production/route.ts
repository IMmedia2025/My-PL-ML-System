import { NextRequest, NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { ProductionMLModel } from '@/lib/ml/production-model'
import { withAuth } from '@/lib/middleware/api-auth'

async function trainHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log(`Model training requested by API key: ${auth.apiKey.name}`)
    
    // Initialize data and model
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    const model = new ProductionMLModel(db)
    
    // Train the model
    const trainingMetrics = await model.trainModel()
    
    console.log('Production training completed successfully')
    
    return NextResponse.json({
      success: true,
      message: 'Production model training completed successfully',
      metrics: {
        accuracy: (trainingMetrics.accuracy * 100).toFixed(2) + '%',
        validation_accuracy: trainingMetrics.val_accuracy ? 
          (trainingMetrics.val_accuracy * 100).toFixed(2) + '%' : 'N/A',
        loss: trainingMetrics.loss.toFixed(4),
        epochs: 50,
        training_samples: trainingMetrics.samples || 0,
        model_version: '1.0.0',
        estimated_accuracy: '80-83%'
      },
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Production training error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Production model training failed', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

async function trainingStatusHandler(request: NextRequest, context: any, auth: { apiKey: any }) {
  try {
    console.log('Training status check requested')
    
    // Initialize database
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Check for training history
    const trainingHistory = await db.getTrainingHistory(5)
    const lastTraining = trainingHistory.length > 0 ? trainingHistory[0] : null
    
    // Check model availability
    const modelExists = await db.checkModelExists()
    
    return NextResponse.json({
      success: true,
      status: {
        modelTrained: modelExists,
        lastTrainingTime: lastTraining?.created_at || null,
        lastAccuracy: lastTraining?.accuracy || null,
        modelVersion: lastTraining?.model_version || '1.0.0',
        totalTrainingRuns: trainingHistory.length,
        systemReady: modelExists
      },
      recentTrainingHistory: trainingHistory.map(run => ({
        date: run.created_at,
        accuracy: run.accuracy,
        samples: run.training_samples,
        version: run.model_version
      })),
      api_key: auth.apiKey.name,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Training status check error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to get training status', 
        details: errorMessage 
      },
      { status: 500 }
    )
  }
}

export const POST = withAuth(trainHandler)
export const GET = withAuth(trainingStatusHandler)
