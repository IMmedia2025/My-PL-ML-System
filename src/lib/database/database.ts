// Simplified version for Vercel deployment
export class FPLDatabase {
  private initialized = false
  private data: any = {
    teams: [],
    players: [],
    fixtures: [],
    predictions: []
  }

  constructor(dbPath?: string) {
    // For Vercel, we'll use in-memory storage
    console.log('Initializing in-memory database for Vercel deployment')
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    console.log('Database initialized (in-memory mode)')
  }

  async insertTeams(teams: any[]): Promise<void> {
    this.data.teams = teams
    console.log(`Stored ${teams.length} teams`)
  }

  async insertPlayers(players: any[]): Promise<void> {
    this.data.players = players
    console.log(`Stored ${players.length} players`)
  }

  async insertFixtures(fixtures: any[]): Promise<void> {
    this.data.fixtures = fixtures
    console.log(`Stored ${fixtures.length} fixtures`)
  }

  async getFinishedMatches(): Promise<any[]> {
    return this.data.fixtures.filter((f: any) => f.finished && f.team_h_score !== null)
  }

  async getUpcomingFixtures(limit: number = 50): Promise<any[]> {
    return this.data.fixtures
      .filter((f: any) => !f.finished)
      .slice(0, limit)
      .map((f: any) => ({
        ...f,
        home_team_name: this.data.teams.find((t: any) => t.id === f.team_h)?.name || 'Unknown',
        away_team_name: this.data.teams.find((t: any) => t.id === f.team_a)?.name || 'Unknown'
      }))
  }

  async savePrediction(prediction: any): Promise<void> {
    this.data.predictions.push({
      ...prediction,
      id: this.data.predictions.length + 1,
      created_at: new Date().toISOString()
    })
  }

  async getLatestPredictions(limit: number = 10): Promise<any[]> {
    return this.data.predictions
      .slice(-limit)
      .map((p: any) => ({
        ...p,
        home_team_name: this.data.teams.find((t: any) => t.id === p.home_team_id)?.name || 'Unknown',
        away_team_name: this.data.teams.find((t: any) => t.id === p.away_team_id)?.name || 'Unknown'
      }))
  }

  async close(): Promise<void> {
    // No-op for in-memory database
  }
}
