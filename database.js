const { createClient } = require('@libsql/client');

let db;
let initialized = false;

function getDB() {
  if (!db) {
    db = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:lab-assistant.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

async function initDB() {
  if (initialized) return;
  const client = getDB();
  await client.batch([
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      task_tab INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_session_tab ON messages(session_id, task_tab)`,
  ], 'write');
  initialized = true;
}

async function createSession(id, nickname) {
  const client = getDB();
  await client.execute({
    sql: 'INSERT OR IGNORE INTO sessions (id, nickname) VALUES (?, ?)',
    args: [id, nickname],
  });
}

async function saveMessage(sessionId, taskTab, role, content) {
  const client = getDB();
  await client.execute({
    sql: 'INSERT INTO messages (session_id, task_tab, role, content) VALUES (?, ?, ?, ?)',
    args: [sessionId, taskTab, role, content],
  });
}

async function getMessages(sessionId, taskTab) {
  const client = getDB();
  const result = await client.execute({
    sql: 'SELECT role, content, created_at FROM messages WHERE session_id = ? AND task_tab = ? ORDER BY created_at ASC',
    args: [sessionId, taskTab],
  });
  return result.rows;
}

async function getSessions() {
  const client = getDB();
  const result = await client.execute(`
    SELECT s.id, s.nickname, s.created_at,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count,
      (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.id) as last_active
    FROM sessions s
    ORDER BY last_active DESC NULLS LAST
  `);
  return result.rows;
}

async function getSessionMessages(sessionId) {
  const client = getDB();
  const result = await client.execute({
    sql: 'SELECT id, task_tab, role, content, created_at FROM messages WHERE session_id = ? ORDER BY task_tab, created_at ASC',
    args: [sessionId],
  });
  return result.rows;
}

module.exports = {
  initDB,
  createSession,
  saveMessage,
  getMessages,
  getSessions,
  getSessionMessages,
};
