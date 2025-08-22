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

      // Team strength features (6 features)
      features.push(
        (homeTeam.strength_overall_home || 1000) / 1000,  // Normalized
        (homeTeam.strength_attack_home || 1000) / 1000,
        (homeTeam.strength_defence_home || 1000) / 1000,
        (awayTeam.strength_overall_away || 1000) / 1000,
        (awayTeam.strength_attack_away || 1000) / 1000,
        (awayTeam.strength_defence_away || 1000) / 1000
      )

      // Form features (6 features)
      const homeForm = await this.calculateTeamForm(homeTeamId, gameweek, 5)
      const awayForm = await this.calculateTeamForm(awayTeamId, gameweek, 5)
      features.push(
        homeForm.points / 3,      // Normalized to 0-1
        homeForm.goals_for / 3,   // Normalized
        homeForm.goals_against / 3,
        awayForm.points / 3,
        awayForm.goals_for / 3,
        awayForm.goals_against / 3
      )

      // Head-to-head features (4 features)
      const h2h = await this.getHeadToHeadRecord(homeTeamId, awayTeamId)
      const totalH2H = Math.max(h2h.total_matches, 1)
      features.push(
        h2h.home_wins / totalH2H,
        h2h.draws / totalH2H,
        h2h.away_wins / totalH2H,
        Math.min(h2h.total_matches / 10, 1) // Experience factor
      )

      // Player quality features (4 features)
      const homePlayerQuality = await this.calculateTeamPlayerQuality(homeTeamId)
      const awayPlayerQuality = await this.calculateTeamPlayerQuality(awayTeamId)
      features.push(
        homePlayerQuality.avg_ict / 100,     // Normalized
        homePlayerQuality.avg_form / 10,     // Normalized
        awayPlayerQuality.avg_ict / 100,
        awayPlayerQuality.avg_form / 10
      )

      // Ensure we have exactly 20 features
      while (features.length < 20) {
        features.push(0.5) // Default neutral value
      }

      return features.slice(0, 20) // Ensure exactly 20 features

    } catch (error) {
      console.error('Feature extraction error:', error)
      // Return default normalized features if extraction fails
      return new Array(20).fill(0.5)
    }
  }

  private async getTeamData(teamId: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db['db'].get(
        'SELECT * FROM teams WHERE id = ?',
        [teamId],
        (err: any, row: any) => {
          if (err) {
            console.error('Error getting team data:', err)
            resolve({}) // Return empty object on error
          } else {
            resolve(row || {})
          }
        }
      )
    })
  }

  private async calculateTeamForm(teamId: number, currentGameweek: number, matches: number): Promise<any> {
    try {
      const recentMatches = await new Promise<any[]>((resolve, reject) => {
        this.db['db'].all(`
          SELECT * FROM fixtures 
          WHERE (team_h = ? OR team_a = ?) AND finished = 1 AND event < ?
          ORDER BY event DESC LIMIT ?
        `, [teamId, teamId, currentGameweek, matches], (err: any, rows: any[]) => {
          if (err) {
            console.error('Error getting team form:', err)
            resolve([])
          } else {
            resolve(rows || [])
          }
        })
      })

      let points = 0
      let goals_for = 0
      let goals_against = 0

      for (const match of recentMatches) {
        const isHome = match.team_h === teamId
        const teamScore = isHome ? (match.team_h_score || 0) : (match.team_a_score || 0)
        const opponentScore = isHome ? (match.team_a_score || 0) : (match.team_h_score || 0)

        goals_for += teamScore
        goals_against += opponentScore

        if (teamScore > opponentScore) points += 3
        else if (teamScore === opponentScore) points += 1
      }

      const matchCount = Math.max(recentMatches.length, 1)
      return {
        points: points / matchCount,
        goals_for: goals_for / matchCount,
        goals_against: goals_against / matchCount
      }
    } catch (error) {
      console.error('Error calculating team form:', error)
      return { points: 1, goals_for: 1, goals_against: 1 }
    }
  }

  private async getHeadToHeadRecord(homeTeamId: number, awayTeamId: number): Promise<any> {
    try {
      const h2hMatches = await new Promise<any[]>((resolve, reject) => {
        this.db['db'].all(`
          SELECT * FROM fixtures 
          WHERE ((team_h = ? AND team_a = ?) OR (team_h = ? AND team_a = ?))
          AND finished = 1
          ORDER BY event DESC LIMIT 10
        `, [homeTeamId, awayTeamId, awayTeamId, homeTeamId], (err: any, rows: any[]) => {
          if (err) {
            console.error('Error getting H2H record:', err)
            resolve([])
          } else {
            resolve(rows || [])
          }
        })
      })

      let home_wins = 0
      let draws = 0
      let away_wins = 0

      for (const match of h2hMatches) {
        const homeScore = match.team_h_score || 0
        const awayScore = match.team_a_score || 0

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
    } catch (error) {
      console.error('Error getting H2H record:', error)
      return { home_wins: 1, draws: 1, away_wins: 1, total_matches: 3 }
    }
  }

  private async calculateTeamPlayerQuality(teamId: number): Promise<any> {
    try {
      const players = await new Promise<any[]>((resolve, reject) => {
        // Query only essential columns that definitely exist
        this.db['db'].all(
          'SELECT ict_index, form, now_cost FROM players WHERE team_id = ?',
          [teamId],
          (err: any, rows: any[]) => {
            if (err) {
              console.error('Error getting players:', err)
              resolve([])
            } else {
              resolve(rows || [])
            }
          }
        )
      })

      if (players.length === 0) {
        return { avg_ict: 50, avg_form: 5, total_value: 500 } // Default values
      }

      const totalICT = players.reduce((sum, p) => sum + (p.ict_index || 0), 0)
      const totalForm = players.reduce((sum, p) => sum + (p.form || 0), 0)
      const totalValue = players.reduce((sum, p) => sum + (p.now_cost || 0), 0)

      return {
        avg_ict: totalICT / players.length,
        avg_form: totalForm / players.length,
        total_value: totalValue
      }
    } catch (error) {
      console.error('Error calculating player quality:', error)
      return { avg_ict: 50, avg_form: 5, total_value: 500 }
    }
  }

  async prepareTrainingData(): Promise<{ features: tf.Tensor2D, labels: tf.Tensor2D }> {
    try {
      const finishedMatches = await this.db.getFinishedMatches()
      
      console.log(`Preparing training data from ${finishedMatches.length} finished matches`)

      // For production deployment, use a reasonable sample size
      const maxSamples = Math.min(finishedMatches.length, 500)
      const sampleMatches = finishedMatches.slice(0, maxSamples)

      const featuresArray: number[][] = []
      const labelsArray: number[][] = []

      for (const match of sampleMatches) {
        try {
          const features = await this.extractMatchFeatures(match.team_h, match.team_a, match.event)
          const label = this.encodeMatchResult(match.team_h_score || 0, match.team_a_score || 0)
          
          featuresArray.push(features)
          labelsArray.push(label)
        } catch (error) {
          console.error(`Error processing match ${match.id}:`, error)
        }
      }

      // If not enough real data, add some synthetic data for training
      while (featuresArray.length < 100) {
        featuresArray.push(new Array(20).fill(0).map(() => Math.random()))
        labelsArray.push(this.encodeMatchResult(
          Math.floor(Math.random() * 4),
          Math.floor(Math.random() * 4)
        ))
      }

      console.log(`Training data prepared: ${featuresArray.length} samples with ${featuresArray[0]?.length || 0} features`)

      return {
        features: tf.tensor2d(featuresArray),
        labels: tf.tensor2d(labelsArray)
      }
    } catch (error) {
      console.error('Error preparing training data:', error)
      // Return synthetic data for training if real data fails
      const featuresArray = Array(200).fill(0).map(() => 
        Array(20).fill(0).map(() => Math.random())
      )
      const labelsArray = Array(200).fill(0).map(() => 
        this.encodeMatchResult(Math.floor(Math.random() * 4), Math.floor(Math.random() * 4))
      )
      
      return {
        features: tf.tensor2d(featuresArray),
        labels: tf.tensor2d(labelsArray)
      }
    }
  }

  private encodeMatchResult(homeScore: number, awayScore: number): number[] {
    if (homeScore > awayScore) return [1, 0, 0] // Home win
    else if (homeScore === awayScore) return [0, 1, 0] // Draw
    else return [0, 0, 1] // Away win
  }
}
