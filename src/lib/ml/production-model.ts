import * as tf from '@tensorflow/tfjs-node'
import { FeatureEngineer } from './feature-engineering'
import { FPLDatabase } from '../database/database'
import fs from 'fs'
import path from 'path'

export class ProductionMLModel {
  private model: tf.LayersModel | null = null
  private featureEngineer: FeatureEngineer
  private db: FPLDatabase
  private modelPath: string
  private modelVersion: string

  constructor(database: FPLDatabase) {
    this.db = database
    this.featureEngineer = new FeatureEngineer(database)
    this.modelPath = './data/models'
    this.modelVersion = '1.0.0'
    
    // Ensure model directory exists
    if (!fs.existsSync(this.modelPath)) {
      fs.mkdirSync(this.modelPath, { recursive: true })
    }
  }

  private createModel(inputShape: number): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({ 
          inputShape: [inputShape], 
          units: 128, 
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({ 
          units: 64, 
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: 0.001 })
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ 
          units: 32, 
          activation: 'relu' 
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({ 
          units: 3, 
          activation: 'softmax' 
        }) // Home, Draw, Away
      ]
    })

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    })

    return model
  }

  async loadOrCreateModel(): Promise<void> {
    const modelFile = path.join(this.modelPath, 'model.json')
    
    if (fs.existsSync(modelFile)) {
      try {
        console.log('Loading existing model...')
        this.model = await tf.loadLayersModel(`file://${modelFile}`)
        console.log('Model loaded successfully')
        return
      } catch (error) {
        console.log('Failed to load existing model, creating new one...')
      }
    }

    console.log('Creating new model...')
    this.model = this.createModel(20) // 20 features
    console.log('New model created')
  }

  async trainModel(): Promise<any> {
    if (!this.model) {
      await this.loadOrCreateModel()
    }

    console.log('Preparing training data...')
    const { features, labels } = await this.featureEngineer.prepareTrainingData()
    
    if (features.shape[0] < 100) {
      throw new Error(`Insufficient training data: ${features.shape[0]} samples (minimum 100 required)`)
    }

    console.log(`Training model with ${features.shape[0]} samples...`)
    
    const validationSplit = 0.2
    const epochs = 50
    const batchSize = 32

    const history = await this.model!.fit(features, labels, {
      epochs,
      batchSize,
      validationSplit,
      shuffle: true,
      verbose: 1,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}: loss=${logs?.loss?.toFixed(4)}, accuracy=${logs?.acc?.toFixed(4)}`)
          }
        }
      }
    })

    // Save model
    await this.saveModel()

    // Calculate final metrics
    const finalEpoch = history.history.loss.length - 1
    const metrics = {
      accuracy: history.history.acc[finalEpoch],
      loss: history.history.loss[finalEpoch],
      val_accuracy: history.history.val_acc ? history.history.val_acc[finalEpoch] : null,
      val_loss: history.history.val_loss ? history.history.val_loss[finalEpoch] : null,
      epochs,
      samples: features.shape[0]
    }

    // Save training history
    await this.saveTrainingHistory(metrics)

    console.log('Training completed:', metrics)
    return metrics
  }

  async saveModel(): Promise<void> {
    if (!this.model) return
    
    const modelPath = path.join(this.modelPath, 'model.json')
    await this.model.save(`file://${this.modelPath}`)
    console.log(`Model saved to ${modelPath}`)
  }

  async predictMatch(homeTeamId: number, awayTeamId: number, gameweek: number): Promise<any> {
    if (!this.model) {
      await this.loadOrCreateModel()
    }

    const features = await this.featureEngineer.extractMatchFeatures(homeTeamId, awayTeamId, gameweek)
    const inputTensor = tf.tensor2d([features])
    
    const prediction = this.model!.predict(inputTensor) as tf.Tensor
    const probabilities = await prediction.data()

    const result = {
      home_win_prob: probabilities[0],
      draw_prob: probabilities[1],
      away_win_prob: probabilities[2]
    }

    // Determine most likely outcome
    const maxProb = Math.max(result.home_win_prob, result.draw_prob, result.away_win_prob)
    let outcome = 'Draw'
    if (maxProb === result.home_win_prob) outcome = 'Home Win'
    else if (maxProb === result.away_win_prob) outcome = 'Away Win'

    // Clean up tensors
    inputTensor.dispose()
    prediction.dispose()

    return {
      ...result,
      predicted_outcome: outcome,
      confidence: maxProb,
      model_version: this.modelVersion
    }
  }

  async predictAllUpcomingMatches(): Promise<any[]> {
    const upcomingFixtures = await this.db.getUpcomingFixtures(20)
    const predictions = []

    for (const fixture of upcomingFixtures) {
      try {
        const prediction = await this.predictMatch(fixture.team_h, fixture.team_a, fixture.event || 1)
        
        const predictionData = {
          fixture_id: fixture.id,
          home_team_id: fixture.team_h,
          away_team_id: fixture.team_a,
          home_team_name: fixture.home_team_name,
          away_team_name: fixture.away_team_name,
          gameweek: fixture.event,
          kickoff_time: fixture.kickoff_time,
          ...prediction,
          features_used: ['team_strength', 'form', 'h2h', 'player_quality']
        }

        predictions.push(predictionData)
        
        // Save to database
        await this.db.savePrediction(predictionData)
        
      } catch (error) {
        console.error(`Error predicting fixture ${fixture.id}:`, error)
      }
    }

    console.log(`Generated ${predictions.length} predictions`)
    return predictions
  }

  private async saveTrainingHistory(metrics: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db['db'].run(`
        INSERT INTO training_history (
          model_version, training_samples, accuracy, loss, val_accuracy, val_loss,
          training_duration, features_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        this.modelVersion, metrics.samples, metrics.accuracy, metrics.loss,
        metrics.val_accuracy, metrics.val_loss, 0, 
        JSON.stringify(['team_strength', 'form', 'h2h', 'player_quality'])
      ], function(err) {
        if (err) {
          console.error('Error saving training history:', err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}
