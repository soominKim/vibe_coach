const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');

const {
  initDB,
  createSession,
  saveMessage,
  getMessages,
  getSessions,
  getSessionMessages,
} = require('../database');
const { buildSystemPrompt } = require('../knowledge');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'taejae-vibe-academy-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'taejae2024';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(cors());
app.use(express.json());

// DB 초기화 미들웨어
app.use(async (req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ error: 'DB 초기화 실패' });
  }
});

// POST /api/chat
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, nickname, taskTab, message } = req.body;

    if (!sessionId || !nickname || !taskTab || !message) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }

    if (![1, 2, 3].includes(taskTab)) {
      return res.status(400).json({ error: '유효하지 않은 태스크 탭입니다.' });
    }

    await createSession(sessionId, nickname);
    await saveMessage(sessionId, taskTab, 'user', message);

    const history = await getMessages(sessionId, taskTab);
    const messages = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: buildSystemPrompt(taskTab),
      messages: messages,
    });

    const assistantMessage =
      response.content[0]?.text || '죄송합니다, 응답을 생성하지 못했습니다.';

    await saveMessage(sessionId, taskTab, 'assistant', assistantMessage);

    res.json({ reply: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);

    if (error.status === 401) {
      return res.status(500).json({ error: 'Claude API 인증 실패. API 키를 확인해주세요.' });
    }
    if (error.status === 429) {
      return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }

    res.status(500).json({ error: '서버 에러가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

// 관리자 인증 미들웨어
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// GET /api/admin/sessions
app.get('/api/admin/sessions', adminAuth, async (req, res) => {
  const sessions = await getSessions();
  res.json({ sessions });
});

// GET /api/admin/sessions/:sessionId
app.get('/api/admin/sessions/:sessionId', adminAuth, async (req, res) => {
  const { sessionId } = req.params;
  const messages = await getSessionMessages(sessionId);

  const grouped = { 1: [], 2: [], 3: [] };
  for (const msg of messages) {
    grouped[msg.task_tab].push({
      role: msg.role,
      content: msg.content,
      created_at: msg.created_at,
    });
  }

  res.json({ messages: grouped });
});

module.exports = app;
