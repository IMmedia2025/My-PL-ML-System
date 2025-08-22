const { RealFPLDataFetcher } = require('../dist/lib/data/real-fpl-fetcher')

async function fetchRealData() {
  console.log('=== Fetching Real FPL Data ===')
  
  try {
    const fetcher = new RealFPLDataFetcher()
    const result = await fetcher.fetchAllData()
    
    if (result.success) {
      console.log('✅ Data fetch successful!')
      console.log(`Teams: ${result.data.bootstrap?.teams?.length || 0}`)
      console.log(`Players: ${result.data.bootstrap?.players?.length || 0}`)
      console.log(`Fixtures: ${result.data.fixtures?.length || 0}`)
    } else {
      console.log('⚠️ Data fetch completed with errors:')
      result.errors.forEach(error => console.log(`  - ${error}`))
    }
    
  } catch (error) {
    console.error('❌ Critical error:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  fetchRealData()
}
