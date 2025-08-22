-- FPL Database Schema
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    strength INTEGER,
    strength_overall_home INTEGER,
    strength_overall_away INTEGER,
    strength_attack_home INTEGER,
    strength_attack_away INTEGER,
    strength_defence_home INTEGER,
    strength_defence_away INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    web_name TEXT NOT NULL,
    team_id INTEGER,
    element_type INTEGER,
    now_cost INTEGER,
    total_points INTEGER,
    points_per_game REAL,
    selected_by_percent REAL,
    form REAL,
    transfers_in INTEGER,
    transfers_out INTEGER,
    value_form REAL,
    value_season REAL,
    minutes INTEGER,
    goals_scored INTEGER,
    assists INTEGER,
    clean_sheets INTEGER,
    goals_conceded INTEGER,
    own_goals INTEGER,
    penalties_saved INTEGER,
    penalties_missed INTEGER,
    yellow_cards INTEGER,
    red_cards INTEGER,
    saves INTEGER,
    bonus INTEGER,
    bps INTEGER,
    influence REAL,
    creativity REAL,
    threat REAL,
    ict_index REAL,
    starts INTEGER,
    expected_goals REAL,
    expected_assists REAL,
    expected_goal_involvements REAL,
    expected_goals_conceded REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams (id)
);

CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY,
    event INTEGER,
    team_h INTEGER,
    team_a INTEGER,
    team_h_score INTEGER,
    team_a_score INTEGER,
    finished BOOLEAN,
    finished_provisional BOOLEAN,
    kickoff_time DATETIME,
    difficulty_h INTEGER,
    difficulty_a INTEGER,
    pulse_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_h) REFERENCES teams (id),
    FOREIGN KEY (team_a) REFERENCES teams (id)
);

CREATE TABLE IF NOT EXISTS match_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER,
    home_team_id INTEGER,
    away_team_id INTEGER,
    gameweek INTEGER,
    home_win_prob REAL,
    draw_prob REAL,
    away_win_prob REAL,
    predicted_outcome TEXT,
    confidence REAL,
    model_version TEXT,
    features_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fixture_id) REFERENCES fixtures (id),
    FOREIGN KEY (home_team_id) REFERENCES teams (id),
    FOREIGN KEY (away_team_id) REFERENCES teams (id)
);

CREATE TABLE IF NOT EXISTS training_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model_version TEXT,
    training_samples INTEGER,
    accuracy REAL,
    loss REAL,
    val_accuracy REAL,
    val_loss REAL,
    rps_score REAL,
    training_duration INTEGER,
    features_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fixtures_event ON fixtures(event);
CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_predictions_gameweek ON match_predictions(gameweek);
