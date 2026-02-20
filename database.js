const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'lab-assistant.db'));

// WAL 모드로 동시 읽기 성능 향상
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 테이블 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    task_tab INTEGER NOT NULL CHECK(task_tab IN (1, 2, 3)),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session_tab ON messages(session_id, task_tab);
`);

// 세션 생성
const createSession = db.prepare(
  'INSERT OR IGNORE INTO sessions (id, nickname) VALUES (?, ?)'
);

// 메시지 저장
const saveMessage = db.prepare(
  'INSERT INTO messages (session_id, task_tab, role, content) VALUES (?, ?, ?, ?)'
);

// 특정 세션의 특정 탭 대화 기록 조회
const getMessages = db.prepare(
  'SELECT role, content, created_at FROM messages WHERE session_id = ? AND task_tab = ? ORDER BY created_at ASC'
);

// 전체 세션 목록 (최근 메시지 시간 포함)
const getSessions = db.prepare(`
  SELECT s.id, s.nickname, s.created_at,
    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as message_count,
    (SELECT MAX(m.created_at) FROM messages m WHERE m.session_id = s.id) as last_active
  FROM sessions s
  ORDER BY last_active DESC NULLS LAST
`);

// 특정 세션의 전체 대화 기록 (탭별)
const getSessionMessages = db.prepare(
  'SELECT id, task_tab, role, content, created_at FROM messages WHERE session_id = ? ORDER BY task_tab, created_at ASC'
);

module.exports = {
  db,
  createSession,
  saveMessage,
  getMessages,
  getSessions,
  getSessionMessages,
};
