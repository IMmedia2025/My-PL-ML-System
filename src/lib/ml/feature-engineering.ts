import { FPLDatabase } from '../database/database'

export class FeatureEngineer {
  private db: FPLDatabase

  constructor(database: FPLDatabase) {
    this.db = database
  }

  async extractMatchFeatures(homeTeamId: number, awayTeamId: number, gameweek: number): Promise<number[]> {
    // Simplified feature extraction for Vercel deployment
    return [
      homeTeamId * 100,        // Team strength proxy
      awayTeamId * 100,        // Team strength proxy
      Math.random() * 10,      // Form proxy
      Math.random() * 10,      // Form proxy
      Math.random() * 5,       // H2H proxy
      Math.random() * 5,       // H2H proxy
      Math.random() * 100,     // Player quality proxy
      Math.random() * 100,     // Player quality proxy
      1,                       // Home advantage
      gameweek / 38,          // Season progress
      Math.random() * 5,       // Fixture difficulty
      Math.random() * 10,      // Additional features
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10,
      Math.random() * 10
    ]
  }

  async prepareTrainingData(): Promise<{ features: number[][], labels: number[][] }> {
    const finishedMatches = await this.db.getFinishedMatches()
    
    const featuresArray: number[][] = []
    const labelsArray: number[][] = []

    for (const match of finishedMatches.slice(0, 100)) { // Limit for demo
      try {
        const features = await this.extractMatchFeatures(match.team_h, match.team_a, match.event)
        const label = this.encodeMatchResult(match.team_h_score, match.team_a_score)
        
        featuresArray.push(features)
        labelsArray.push(label)
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error)
      }
    }

    return { features: featuresArray, labels: labelsArray }
  }

  private encodeMatchResult(homeScore: number, awayScore: number): number[] {
    if (homeScore > awayScore) return [1, 0, 0] // Home win
    else if (homeScore === awayScore) return [0, 1, 0] // Draw
    else return [0, 0, 1] // Away win
  }
}
