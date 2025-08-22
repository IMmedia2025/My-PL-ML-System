const { RealFPLDataFetcher } = require('../dist/lib/data/real-fpl-fetcher')
const { ProductionMLModel } = require('../dist/lib/ml/production-model')

async function trainProductionModel() {
  console.log('=== Training Production ML Model ===')
  
  try {
    const fetcher = new RealFPLDataFetcher()
    const db = await fetcher.getDatabase()
    const model = new ProductionMLModel(db)
    
    const metrics = await model.trainModel()
    
    console.log('✅ Training completed!')
    console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`)
    console.log(`Loss: ${metrics.loss.toFixed(4)}`)
    console.log(`Samples: ${metrics.samples}`)
    
  } catch (error) {
    console.error('❌ Training failed:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  trainProductionModel()
}
