CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL, status TEXT NOT NULL,
  status_code INTEGER, response_time INTEGER, error TEXT);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time TEXT NOT NULL, end_time TEXT, reason TEXT,
  downtime INTEGER, recovery_action TEXT, recovery_status TEXT);
CREATE TABLE IF NOT EXISTS recovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL, action TEXT, result TEXT);
