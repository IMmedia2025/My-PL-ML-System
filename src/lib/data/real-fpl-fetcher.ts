import { FPLDatabase } from '../database/database'

export class RealFPLDataFetcher {
  private baseUrl = 'https://fantasy.premierleague.com/api'
  private requestDelay = 1000
  private maxRetries = 3
  private db: FPLDatabase

  constructor() {
    this.db = new FPLDatabase()
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async makeRequest(url: string, retries = 0): Promise<any> {
    try {
      console.log(`Fetching: ${url}`)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      await this.delay(this.requestDelay)
      return data
    } catch (error) {
      if (retries < this.maxRetries) {
        console.log(`Request failed, retrying... (${retries + 1}/${this.maxRetries})`)
        await this.delay(this.requestDelay * (retries + 1))
        return this.makeRequest(url, retries + 1)
      }
      throw error
    }
  }

  async fetchBootstrapData(): Promise<any> {
    const data = await this.makeRequest(`${this.baseUrl}/bootstrap-static/`)
    
    console.log(`Fetched ${data.teams.length} teams and ${data.elements.length} players`)
    
    await this.db.initialize()
    await this.db.insertTeams(data.teams)
    await this.db.insertPlayers(data.elements)
    
    return {
      teams: data.teams,
      players: data.elements,
      gameweeks: data.events,
      playerTypes: data.element_types
    }
  }

  async fetchFixtures(): Promise<any[]> {
    const fixtures = await this.makeRequest(`${this.baseUrl}/fixtures/`)
    
    console.log(`Fetched ${fixtures.length} fixtures`)
    await this.db.insertFixtures(fixtures)
    
    return fixtures
  }

  async fetchCurrentGameweek(): Promise<number> {
    const bootstrap = await this.makeRequest(`${this.baseUrl}/bootstrap-static/`)
    const currentGW = bootstrap.events.find((gw: any) => gw.is_current)
    return currentGW ? currentGW.id : 1
  }

  async fetchAllData(): Promise<{success: boolean, data: any, errors: string[]}> {
    const errors: string[] = []
    let allData: any = {}

    try {
      console.log('=== Starting Real FPL Data Fetch ===')
      
      try {
        allData.bootstrap = await this.fetchBootstrapData()
      } catch (error) {
        const msg = `Bootstrap fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(msg)
        console.error(msg)
      }

      try {
        allData.fixtures = await this.fetchFixtures()
      } catch (error) {
        const msg = `Fixtures fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(msg)
        console.error(msg)
      }

      try {
        allData.currentGameweek = await this.fetchCurrentGameweek()
      } catch (error) {
        const msg = `Current GW fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        errors.push(msg)
        console.error(msg)
      }

      console.log('=== FPL Data Fetch Complete ===')
      return {
        success: errors.length === 0,
        data: allData,
        errors
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      console.error('Critical fetch error:', errorMsg)
      return {
        success: false,
        data: {},
        errors: [errorMsg]
      }
    }
  }

  async getDatabase(): Promise<FPLDatabase> {
    await this.db.initialize()
    return this.db
  }
}
