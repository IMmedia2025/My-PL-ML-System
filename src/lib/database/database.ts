import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

export class FPLDatabase {
  private db: sqlite3.Database
  private initialized = false

  constructor(dbPath: string = './data/fpl_database.db') {
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath)
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    this.db = new sqlite3.Database(dbPath)
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const schemaPath = path.join(process.cwd(), 'src/lib/database/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    const run = promisify(this.db.run.bind(this.db))
    await run(schema)
    
    this.initialized = true
    console.log('Database initialized successfully')
  }

  async insertTeams(teams: any[]): Promise<void> {
    const run = promisify(this.db.run.bind(this.db))
    
    for (const team of teams) {
      await run(`
        INSERT OR REPLACE INTO teams (
          id, name, short_name, strength, strength_overall_home, strength_overall_away,
          strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        team.id, team.name, team.short_name, team.strength,
        team.strength_overall_home, team.strength_overall_away,
        team.strength_attack_home, team.strength_attack_away,
        team.strength_defence_home, team.strength_defence_away
      ])
    }
  }

  async insertPlayers(players: any[]): Promise<void> {
    const run = promisify(this.db.run.bind(this.db))
    
    for (const player of players) {
      await run(`
        INSERT OR REPLACE INTO players (
          id, web_name, team_id, element_type, now_cost, total_points, points_per_game,
          selected_by_percent, form, transfers_in, transfers_out, value_form, value_season,
          minutes, goals_scored, assists, clean_sheets, goals_conceded, own_goals,
          penalties_saved, penalties_missed, yellow_cards, red_cards, saves, bonus, bps,
          influence, creativity, threat, ict_index, starts, expected_goals, expected_assists,
          expected_goal_involvements, expected_goals_conceded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        player.id, player.web_name, player.team, player.element_type, player.now_cost,
        player.total_points, player.points_per_game, player.selected_by_percent, player.form,
        player.transfers_in, player.transfers_out, player.value_form, player.value_season,
        player.minutes, player.goals_scored, player.assists, player.clean_sheets,
        player.goals_conceded, player.own_goals, player.penalties_saved, player.penalties_missed,
        player.yellow_cards, player.red_cards, player.saves, player.bonus, player.bps,
        player.influence, player.creativity, player.threat, player.ict_index, player.starts,
        player.expected_goals, player.expected_assists, player.expected_goal_involvements,
        player.expected_goals_conceded
      ])
    }
  }

  async insertFixtures(fixtures: any[]): Promise<void> {
    const run = promisify(this.db.run.bind(this.db))
    
    for (const fixture of fixtures) {
      await run(`
        INSERT OR REPLACE INTO fixtures (
          id, event, team_h, team_a, team_h_score, team_a_score, finished,
          finished_provisional, kickoff_time, difficulty_h, difficulty_a, pulse_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        fixture.id, fixture.event, fixture.team_h, fixture.team_a,
        fixture.team_h_score, fixture.team_a_score, fixture.finished,
        fixture.finished_provisional, fixture.kickoff_time,
        fixture.team_h_difficulty, fixture.team_a_difficulty, fixture.pulse_id
      ])
    }
  }

  async getFinishedMatches(): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db))
    
    return await all(`
      SELECT f.*, 
             th.name as home_team_name, th.short_name as home_team_short,
             ta.name as away_team_name, ta.short_name as away_team_short
      FROM fixtures f
      JOIN teams th ON f.team_h = th.id
      JOIN teams ta ON f.team_a = ta.id
      WHERE f.finished = 1 AND f.team_h_score IS NOT NULL AND f.team_a_score IS NOT NULL
      ORDER BY f.event, f.id
    `)
  }

  async getUpcomingFixtures(limit: number = 50): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db))
    
    return await all(`
      SELECT f.*, 
             th.name as home_team_name, th.short_name as home_team_short,
             ta.name as away_team_name, ta.short_name as away_team_short
      FROM fixtures f
      JOIN teams th ON f.team_h = th.id
      JOIN teams ta ON f.team_a = ta.id
      WHERE f.finished = 0
      ORDER BY f.kickoff_time
      LIMIT ?
    `, [limit])
  }

  async savePrediction(prediction: any): Promise<void> {
    const run = promisify(this.db.run.bind(this.db))
    
    await run(`
      INSERT INTO match_predictions (
        fixture_id, home_team_id, away_team_id, gameweek, home_win_prob, draw_prob, away_win_prob,
        predicted_outcome, confidence, model_version, features_used
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      prediction.fixture_id, prediction.home_team_id, prediction.away_team_id, prediction.gameweek,
      prediction.home_win_prob, prediction.draw_prob, prediction.away_win_prob,
      prediction.predicted_outcome, prediction.confidence, prediction.model_version,
      JSON.stringify(prediction.features_used)
    ])
  }

  async getLatestPredictions(limit: number = 10): Promise<any[]> {
    const all = promisify(this.db.all.bind(this.db))
    
    return await all(`
      SELECT p.*, 
             th.name as home_team_name, th.short_name as home_team_short,
             ta.name as away_team_name, ta.short_name as away_team_short,
             f.kickoff_time
      FROM match_predictions p
      JOIN teams th ON p.home_team_id = th.id
      JOIN teams ta ON p.away_team_id = ta.id
      LEFT JOIN fixtures f ON p.fixture_id = f.id
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [limit])
  }

  async close(): Promise<void> {
    const close = promisify(this.db.close.bind(this.db))
    await close()
  }
}
