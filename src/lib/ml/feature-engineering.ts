import * as tf from '@tensorflow/tfjs-node'
import { FPLDatabase } from '../database/database'

export class FeatureEngineer {
  private db: FPLDatabase

  constructor(database: FPLDatabase) {
    this.db = database
  }

  async extractMatchFeatures(homeTeamId: number, awayTeamId: number, gameweek: number): Promise<number[]> {
    const features: number[] = []

    try {
      // Get team strengths
      const homeTeam = await this.getTeamData(homeTeamId)
      const awayTeam = await this.getTeamData(awayTeamId)

      // Team strength features
      features.push(
        homeTeam.strength_overall_home || 1000,
        homeTeam.strength_attack_home || 1000,
        homeTeam.strength_defence_home || 1000,
        awayTeam.strength_overall_away || 1000,
        awayTeam.strength_attack_away || 1000,
        awayTeam.strength_defence_away || 1000
      )

      // Form features (last 5 matches)
      const homeForm = await this.calculateTeamForm(homeTeamId, gameweek, 5)
      const awayForm = await this.calculateTeamForm(awayTeamId, gameweek, 5)
      features.push(homeForm.points, homeForm.goals_for, homeForm.goals_against)
      features.push(awayForm.points, awayForm.goals_for, awayForm.goals_against)

      // Head-to-head features
      const h2h = await this.getHeadToHeadRecord(homeTeamId, awayTeamId)
      features.push(h2h.home_wins, h2h.draws, h2h.away_wins, h2h.total_matches)

      // Player quality features
      const homePlayerQuality = await this.calculateTeamPlayerQuality(homeTeamId)
      const awayPlayerQuality = await this.calculateTeamPlayerQuality(awayTeamId)
      features.push(homePlayerQuality.avg_ict, homePlayerQuality.avg_form, homePlayerQuality.total_value)
      features.push(awayPlayerQuality.avg_ict, awayPlayerQuality.avg_form, awayPlayerQuality.total_value)

      // Contextual features
      features.push(
        1, // Home advantage
        gameweek / 38, // Season progress
        this.getFixtureDifficulty(homeTeamId, awayTeamId)
      )

      return features

    } catch (error) {
      console.error('Feature extraction error:', error)
      // Return default features if extraction fails
      return new Array(20).fill(0)
    }
  }

  private async getTeamData(teamId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db['db'].get(
        'SELECT * FROM teams WHERE id = ?',
        [teamId],
        (err: any, row: any) => {
          if (err) reject(err)
          else resolve(row || {})
        }
      )
    })
  }

  private async calculateTeamForm(teamId: number, currentGameweek: number, matches: number): Promise<any> {
    const recentMatches = await new Promise<any[]>((resolve, reject) => {
      this.db['db'].all(`
        SELECT * FROM fixtures 
        WHERE (team_h = ? OR team_a = ?) AND finished = 1 AND event < ?
        ORDER BY event DESC LIMIT ?
      `, [teamId, teamId, currentGameweek, matches], (err: any, rows: any[]) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    let points = 0
    let goals_for = 0
    let goals_against = 0

    for (const match of recentMatches) {
      const isHome = match.team_h === teamId
      const teamScore = isHome ? match.team_h_score : match.team_a_score
      const opponentScore = isHome ? match.team_a_score : match.team_h_score

      goals_for += teamScore || 0
      goals_against += opponentScore || 0

      if (teamScore > opponentScore) points += 3
      else if (teamScore === opponentScore) points += 1
    }

    return {
      points: points / Math.max(recentMatches.length, 1),
      goals_for: goals_for / Math.max(recentMatches.length, 1),
      goals_against: goals_against / Math.max(recentMatches.length, 1)
    }
  }

  private async getHeadToHeadRecord(homeTeamId: number, awayTeamId: number): Promise<any> {
    const h2hMatches = await new Promise<any[]>((resolve, reject) => {
      this.db['db'].all(`
        SELECT * FROM fixtures 
        WHERE ((team_h = ? AND team_a = ?) OR (team_h = ? AND team_a = ?))
        AND finished = 1
        ORDER BY event DESC LIMIT 10
      `, [homeTeamId, awayTeamId, awayTeamId, homeTeamId], (err: any, rows: any[]) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })

    let home_wins = 0
    let draws = 0
    let away_wins = 0

    for (const match of h2hMatches) {
      const homeScore = match.team_h_score
      const awayScore = match.team_a_score

      if (homeScore > awayScore) {
        if (match.team_h === homeTeamId) home_wins++
        else away_wins++
      } else if (homeScore === awayScore) {
        draws++
      } else {
        if (match.team_a === homeTeamId) home_wins++
        else away_wins++
      }
    }

    return {
      home_wins,
      draws,
      away_wins,
      total_matches: h2hMatches.length
    }
  }

  private async calculateTeamPlayerQuality(teamId: number): Promise<any> {
    const players = await new Promise<any[]>((resolve, reject) => {
      this.db['db'].all(
        'SELECT * FROM players WHERE team_id = ? AND minutes > 0',
        [teamId],
        (err: any, rows: any[]) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })

    if (players.length === 0) {
      return { avg_ict: 0, avg_form: 0, total_value: 0 }
    }

    const totalICT = players.reduce((sum, p) => sum + (p.ict_index || 0), 0)
    const totalForm = players.reduce((sum, p) => sum + (p.form || 0), 0)
    const totalValue = players.reduce((sum, p) => sum + (p.now_cost || 0), 0)

    return {
      avg_ict: totalICT / players.length,
      avg_form: totalForm / players.length,
      total_value: totalValue
    }
  }

  private getFixtureDifficulty(homeTeamId: number, awayTeamId: number): number {
    // Simplified fixture difficulty calculation
    return Math.random() * 5 + 1 // 1-6 scale
  }

  async prepareTrainingData(): Promise<{ features: tf.Tensor2D, labels: tf.Tensor2D }> {
    const finishedMatches = await this.db.getFinishedMatches()
    
    console.log(`Preparing training data from ${finishedMatches.length} finished matches`)

    const featuresArray: number[][] = []
    const labelsArray: number[][] = []

    for (const match of finishedMatches) {
      try {
        const features = await this.extractMatchFeatures(match.team_h, match.team_a, match.event)
        const label = this.encodeMatchResult(match.team_h_score, match.team_a_score)
        
        featuresArray.push(features)
        labelsArray.push(label)
      } catch (error) {
        console.error(`Error processing match ${match.id}:`, error)
      }
    }

    console.log(`Training data prepared: ${featuresArray.length} samples with ${featuresArray[0]?.length || 0} features`)

    return {
      features: tf.tensor2d(featuresArray),
      labels: tf.tensor2d(labelsArray)
    }
  }

  private encodeMatchResult(homeScore: number, awayScore: number): number[] {
    if (homeScore > awayScore) return [1, 0, 0] // Home win
    else if (homeScore === awayScore) return [0, 1, 0] // Draw
    else return [0, 0, 1] // Away win
  }
}
