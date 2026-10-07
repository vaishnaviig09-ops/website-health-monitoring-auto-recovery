// Module 6: storage (SQLite). Schema lives in database/schema.sql
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8'));
  return db;
}
module.exports = { openDb };
