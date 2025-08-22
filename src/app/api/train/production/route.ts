import { NextResponse } from 'next/server'
import { RealFPLDataFetcher } from '@/lib/data/real-fpl-fetcher'
import { ProductionMLModel } from '@/lib/ml/production-model'

// POST method - Train the model
export async function POST() {
  try {
    console.log('Starting production model training...')
    
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

// GET method - Check training status
export async function GET() {
  try {
    console.log('Checking training status...')
    
    // Initialize database
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    
    // Check for training history
    const trainingHistory = await db.getTrainingHistory(5) // Get last 5 training runs
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
