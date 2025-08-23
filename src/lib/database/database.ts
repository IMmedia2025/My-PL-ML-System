import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'

export class FPLDatabase {
  private db: sqlite3.Database
  private dbPath: string

  constructor(dbPath: string = './data/premier_league.db') {
    this.dbPath = dbPath
    
    // Ensure directory exists
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err.message)
      } else {
        console.log('Connected to SQLite database')
      }
    })
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Create tables
      const tables = [
        // Teams table
        `CREATE TABLE IF NOT EXISTS teams (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          short_name TEXT,
          code INTEGER,
          strength INTEGER,
          strength_overall_home INTEGER,
          strength_overall_away INTEGER,
          strength_attack_home INTEGER,
          strength_attack_away INTEGER,
          strength_defence_home INTEGER,
          strength_defence_away INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // Players table with ALL FPL columns
        `CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY,
          first_name TEXT,
          second_name TEXT,
          web_name TEXT,
          team_id INTEGER,
          element_type INTEGER,
          now_cost INTEGER,
          total_points INTEGER,
          points_per_game REAL,
          form REAL,
          selected_by_percent REAL,
          transfers_in INTEGER,
          transfers_out INTEGER,
          value_form REAL,
          value_season REAL,
          minutes INTEGER DEFAULT 0,
          goals_scored INTEGER DEFAULT 0,
          assists INTEGER DEFAULT 0,
          clean_sheets INTEGER DEFAULT 0,
          goals_conceded INTEGER DEFAULT 0,
          own_goals INTEGER DEFAULT 0,
          penalties_saved INTEGER DEFAULT 0,
          penalties_missed INTEGER DEFAULT 0,
          yellow_cards INTEGER DEFAULT 0,
          red_cards INTEGER DEFAULT 0,
          saves INTEGER DEFAULT 0,
          bonus INTEGER DEFAULT 0,
          bps INTEGER DEFAULT 0,
          influence REAL DEFAULT 0,
          creativity REAL DEFAULT 0,
          threat REAL DEFAULT 0,
          ict_index REAL DEFAULT 0,
          starts INTEGER DEFAULT 0,
          expected_goals REAL DEFAULT 0,
          expected_assists REAL DEFAULT 0,
          expected_goal_involvements REAL DEFAULT 0,
          expected_goals_conceded REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_id) REFERENCES teams (id)
        )`,

        // Fixtures table
        `CREATE TABLE IF NOT EXISTS fixtures (
          id INTEGER PRIMARY KEY,
          event INTEGER,
          team_h INTEGER,
          team_a INTEGER,
          team_h_score INTEGER,
          team_a_score INTEGER,
          finished BOOLEAN DEFAULT 0,
          kickoff_time TEXT,
          difficulty_h INTEGER,
          difficulty_a INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_h) REFERENCES teams (id),
          FOREIGN KEY (team_a) REFERENCES teams (id)
        )`,

        // Predictions table
        `CREATE TABLE IF NOT EXISTS predictions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          fixture_id INTEGER,
          home_team_id INTEGER,
          away_team_id INTEGER,
          home_team_name TEXT,
          away_team_name TEXT,
          predicted_outcome TEXT,
          confidence REAL,
          home_win_prob REAL,
          draw_prob REAL,
          away_win_prob REAL,
          gameweek INTEGER,
          kickoff_time TEXT,
          model_version TEXT,
          features_used TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
          FOREIGN KEY (home_team_id) REFERENCES teams (id),
          FOREIGN KEY (away_team_id) REFERENCES teams (id)
        )`,

        // Training history table
        `CREATE TABLE IF NOT EXISTS training_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model_version TEXT,
          training_samples INTEGER,
          accuracy REAL,
          loss REAL,
          val_accuracy REAL,
          val_loss REAL,
          training_duration INTEGER,
          features_used TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,

        // API Keys table
        `CREATE TABLE IF NOT EXISTS api_keys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_active BOOLEAN DEFAULT 1,
          rate_limit INTEGER DEFAULT 1000,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_used_at DATETIME,
          expires_at DATETIME
        )`,

        // API Usage table
        `CREATE TABLE IF NOT EXISTS api_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key_id INTEGER,
          endpoint TEXT NOT NULL,
          method TEXT NOT NULL,
          status_code INTEGER,
          response_time_ms INTEGER,
          user_agent TEXT,
          ip_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (api_key_id) REFERENCES api_keys (id)
        )`,

        // API Usage Daily Stats table
        `CREATE TABLE IF NOT EXISTS api_usage_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_key_id INTEGER,
          date TEXT NOT NULL,
          total_requests INTEGER DEFAULT 0,
          successful_requests INTEGER DEFAULT 0,
          failed_requests INTEGER DEFAULT 0,
          avg_response_time_ms REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (api_key_id) REFERENCES api_keys (id),
          UNIQUE(api_key_id, date)
        )`
      ]

      let completed = 0
      const total = tables.length

      tables.forEach((sql) => {
        this.db.run(sql, (err) => {
          if (err) {
            console.error('Error creating table:', err.message)
            reject(err)
          } else {
            completed++
            if (completed === total) {
              // Create indexes for better performance
              this.createIndexes()
              console.log('Database initialized successfully')
              resolve()
            }
          }
        })
      })
    })
  }

  private createIndexes(): void {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key)',
      'CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage(api_key_id, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_api_stats_key_date ON api_usage_stats(api_key_id, date)',
      'CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_fixtures_event ON fixtures(event)'
    ]

    indexes.forEach(sql => {
      this.db.run(sql, (err) => {
        if (err) console.error('Index creation error:', err.message)
      })
    })
  }

  // API Key Methods
  async createApiKey(data: { name: string, description?: string, rateLimit?: number }): Promise<string> {
    return new Promise((resolve, reject) => {
      const apiKey = this.generateApiKey()
      
      this.db.run(`
        INSERT INTO api_keys (api_key, name, description, rate_limit)
        VALUES (?, ?, ?, ?)
      `, [apiKey, data.name, data.description || '', data.rateLimit || 1000], (err) => {
        if (err) {
          console.error('Error creating API key:', err)
          reject(err)
        } else {
          resolve(apiKey)
        }
      })
    })
  }

  async validateApiKey(apiKey: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM api_keys 
        WHERE api_key = ? AND is_active = 1 
        AND (expires_at IS NULL OR expires_at > datetime('now'))
      `, [apiKey], (err, row) => {
        if (err) {
          console.error('Error validating API key:', err)
          resolve(null)
        } else {
          if (row) {
            // Update last used timestamp
            this.updateApiKeyLastUsed(apiKey)
          }
          resolve(row)
        }
      })
    })
  }

  async logApiUsage(data: {
    apiKeyId: number,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTimeMs: number,
    userAgent?: string,
    ipAddress?: string
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO api_usage (
          api_key_id, endpoint, method, status_code, response_time_ms, 
          user_agent, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        data.apiKeyId, data.endpoint, data.method, data.statusCode, 
        data.responseTimeMs, data.userAgent || '', data.ipAddress || ''
      ], (err) => {
        if (err) console.error('Error logging API usage:', err)
        resolve()
      })
    })

    // Update daily stats
    this.updateDailyStats(data.apiKeyId, data.statusCode, data.responseTimeMs)
  }

  async getApiUsageSince(apiKeyId: number, since: string): Promise<number> {
    return new Promise((resolve) => {
      this.db.get(`
        SELECT COUNT(*) as count 
        FROM api_usage 
        WHERE api_key_id = ? AND created_at > ?
      `, [apiKeyId, since], (err, row: any) => {
        if (err) {
          console.error('Error getting API usage count:', err)
          resolve(0)
        } else {
          resolve(row?.count || 0)
        }
      })
    })
  }

  async getApiKeyUsageStats(apiKeyId: number, days: number = 30): Promise<any[]> {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT date, total_requests, successful_requests, failed_requests, avg_response_time_ms
        FROM api_usage_stats 
        WHERE api_key_id = ? 
        ORDER BY date DESC 
        LIMIT ?
      `, [apiKeyId, days], (err, rows) => {
        if (err) {
          console.error('Error getting usage stats:', err)
          resolve([])
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async getAllApiKeys(): Promise<any[]> {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT 
          ak.*,
          COUNT(au.id) as total_requests,
          MAX(au.created_at) as last_request
        FROM api_keys ak
        LEFT JOIN api_usage au ON ak.id = au.api_key_id
        GROUP BY ak.id
        ORDER BY ak.created_at DESC
      `, (err, rows) => {
        if (err) {
          console.error('Error getting API keys:', err)
          resolve([])
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  private updateApiKeyLastUsed(apiKey: string): void {
    this.db.run(`
      UPDATE api_keys 
      SET last_used_at = datetime('now') 
      WHERE api_key = ?
    `, [apiKey])
  }

  private updateDailyStats(apiKeyId: number, statusCode: number, responseTimeMs: number): void {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const isSuccess = statusCode >= 200 && statusCode < 400 ? 1 : 0
    const isFailed = isSuccess ? 0 : 1

    this.db.run(`
      INSERT INTO api_usage_stats (
        api_key_id, date, total_requests, successful_requests, failed_requests, avg_response_time_ms
      ) VALUES (?, ?, 1, ?, ?, ?)
      ON CONFLICT(api_key_id, date) DO UPDATE SET
        total_requests = total_requests + 1,
        successful_requests = successful_requests + ?,
        failed_requests = failed_requests + ?,
        avg_response_time_ms = (avg_response_time_ms * (total_requests - 1) + ?) / total_requests,
        updated_at = datetime('now')
    `, [apiKeyId, today, isSuccess, isFailed, responseTimeMs, isSuccess, isFailed, responseTimeMs])
  }

  private generateApiKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = 'fpl_'
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  async insertTeams(teams: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO teams (
          id, name, short_name, code, strength,
          strength_overall_home, strength_overall_away,
          strength_attack_home, strength_attack_away,
          strength_defence_home, strength_defence_away
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let completed = 0
      teams.forEach((team) => {
        stmt.run([
          team.id, team.name, team.short_name, team.code, team.strength,
          team.strength_overall_home, team.strength_overall_away,
          team.strength_attack_home, team.strength_attack_away,
          team.strength_defence_home, team.strength_defence_away
        ], (err) => {
          if (err) {
            console.error('Error inserting team:', err.message)
          }
          completed++
          if (completed === teams.length) {
            stmt.finalize()
            console.log(`Inserted ${teams.length} teams`)
            resolve()
          }
        })
      })
    })
  }

  async insertPlayers(players: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO players (
          id, first_name, second_name, web_name, team_id, element_type,
          now_cost, total_points, points_per_game, form, selected_by_percent,
          transfers_in, transfers_out, value_form, value_season,
          minutes, goals_scored, assists, clean_sheets, goals_conceded,
          own_goals, penalties_saved, penalties_missed, yellow_cards, red_cards,
          saves, bonus, bps, influence, creativity, threat, ict_index,
          starts, expected_goals, expected_assists, expected_goal_involvements,
          expected_goals_conceded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let completed = 0
      players.forEach((player) => {
        stmt.run([
          player.id, player.first_name, player.second_name, player.web_name,
          player.team, player.element_type, player.now_cost, player.total_points,
          player.points_per_game, player.form, player.selected_by_percent,
          player.transfers_in, player.transfers_out, player.value_form, player.value_season,
          player.minutes || 0, player.goals_scored || 0, player.assists || 0,
          player.clean_sheets || 0, player.goals_conceded || 0, player.own_goals || 0,
          player.penalties_saved || 0, player.penalties_missed || 0, 
          player.yellow_cards || 0, player.red_cards || 0, player.saves || 0,
          player.bonus || 0, player.bps || 0, player.influence || 0,
          player.creativity || 0, player.threat || 0, player.ict_index || 0,
          player.starts || 0, player.expected_goals || 0, player.expected_assists || 0,
          player.expected_goal_involvements || 0, player.expected_goals_conceded || 0
        ], (err) => {
          if (err) {
            console.error('Error inserting player:', err.message)
          }
          completed++
          if (completed === players.length) {
            stmt.finalize()
            console.log(`Inserted ${players.length} players`)
            resolve()
          }
        })
      })
    })
  }

  async insertFixtures(fixtures: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO fixtures (
          id, event, team_h, team_a, team_h_score, team_a_score,
          finished, kickoff_time, difficulty_h, difficulty_a
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      let completed = 0
      fixtures.forEach((fixture) => {
        stmt.run([
          fixture.id, fixture.event, fixture.team_h, fixture.team_a,
          fixture.team_h_score, fixture.team_a_score, fixture.finished,
          fixture.kickoff_time, fixture.team_h_difficulty, fixture.team_a_difficulty
        ], (err) => {
          if (err) {
            console.error('Error inserting fixture:', err.message)
          }
          completed++
          if (completed === fixtures.length) {
            stmt.finalize()
            console.log(`Inserted ${fixtures.length} fixtures`)
            resolve()
          }
        })
      })
    })
  }

  async savePrediction(prediction: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO predictions (
          fixture_id, home_team_id, away_team_id, home_team_name, away_team_name,
          predicted_outcome, confidence, home_win_prob, draw_prob, away_win_prob,
          gameweek, kickoff_time, model_version, features_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        prediction.fixture_id, prediction.home_team_id, prediction.away_team_id,
        prediction.home_team_name, prediction.away_team_name, prediction.predicted_outcome,
        prediction.confidence, prediction.home_win_prob, prediction.draw_prob,
        prediction.away_win_prob, prediction.gameweek, prediction.kickoff_time,
        prediction.model_version, JSON.stringify(prediction.features_used)
      ], (err) => {
        if (err) {
          console.error('Error saving prediction:', err.message)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  async getLatestPredictions(limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM predictions 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          console.error('Error getting latest predictions:', err)
          resolve([])
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async getTrainingHistory(limit: number = 10): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM training_history 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          console.error('Error getting training history:', err)
          resolve([]) // Return empty array on error
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async checkModelExists(): Promise<boolean> {
    return new Promise((resolve) => {
      this.db.get(`
        SELECT COUNT(*) as count FROM training_history 
        WHERE accuracy > 0
      `, (err, row: any) => {
        if (err) {
          console.error('Error checking model existence:', err)
          resolve(false)
        } else {
          resolve((row?.count || 0) > 0)
        }
      })
    })
  }

  async getAllFixtures(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          f.*,
          h.name as home_team_name,
          a.name as away_team_name
        FROM fixtures f
        LEFT JOIN teams h ON f.team_h = h.id
        LEFT JOIN teams a ON f.team_a = a.id
        ORDER BY f.event ASC, f.kickoff_time ASC
      `, (err, rows) => {
        if (err) {
          console.error('Error getting all fixtures:', err)
          resolve([]) // Return empty array on error
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async getUpcomingFixtures(limit: number = 20): Promise<any[]> {
    return new Promise((resolve, reject) => {
      // Get fixtures that haven't finished yet (finished = 0 or NULL)
      this.db.all(`
        SELECT 
          f.*,
          h.name as home_team_name,
          a.name as away_team_name
        FROM fixtures f
        LEFT JOIN teams h ON f.team_h = h.id
        LEFT JOIN teams a ON f.team_a = a.id
        WHERE (f.finished = 0 OR f.finished IS NULL)
          AND f.team_h IS NOT NULL 
          AND f.team_a IS NOT NULL
        ORDER BY f.event ASC, f.kickoff_time ASC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          console.error('Error getting upcoming fixtures:', err)
          resolve([]) // Return empty array on error
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async getFinishedMatches(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM fixtures 
        WHERE finished = 1 
          AND team_h_score IS NOT NULL 
          AND team_a_score IS NOT NULL
        ORDER BY event ASC
      `, (err, rows) => {
        if (err) {
          console.error('Error getting finished matches:', err)
          resolve([]) // Return empty array on error
        } else {
          resolve(rows || [])
        }
      })
    })
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message)
        } else {
          console.log('Database connection closed')
        }
        resolve()
      })
    })
  }
}
