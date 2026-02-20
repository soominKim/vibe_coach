require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

const {
  createSession,
  saveMessage,
  getMessages,
  getSessions,
  getSessionMessages,
} = require('./database');
const { buildSystemPrompt } = require('./knowledge');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'taejae-vibe-academy-secret-key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'taejae2024';

// Claude API 클라이언트
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 학생용 API
// ============================================

// POST /api/chat — 학생 메시지 → Claude API → 응답
app.post('/api/chat', async (req, res) => {
  try {
    const { sessionId, nickname, taskTab, message } = req.body;

    if (!sessionId || !nickname || !taskTab || !message) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }

    if (![1, 2, 3].includes(taskTab)) {
      return res.status(400).json({ error: '유효하지 않은 태스크 탭입니다.' });
    }

    // 세션 생성 (이미 존재하면 무시)
    createSession.run(sessionId, nickname);

    // 사용자 메시지 저장
    saveMessage.run(sessionId, taskTab, 'user', message);

    // 이전 대화 기록 불러오기 (컨텍스트 유지)
    const history = getMessages.all(sessionId, taskTab);

    // Claude API 호출용 메시지 배열 구성
    const messages = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Claude API 호출
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: buildSystemPrompt(taskTab),
      messages: messages,
    });

    const assistantMessage =
      response.content[0]?.text || '죄송합니다, 응답을 생성하지 못했습니다.';

    // 어시스턴트 응답 저장
    saveMessage.run(sessionId, taskTab, 'assistant', assistantMessage);

    res.json({ reply: assistantMessage });
  } catch (error) {
    console.error('Chat API error:', error);

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Claude API 인증 실패. API 키를 확인해주세요.',
      });
    }
    if (error.status === 429) {
      return res.status(429).json({
        error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      });
    }

    res.status(500).json({
      error: '서버 에러가 발생했습니다. 잠시 후 다시 시도해주세요.',
    });
  }
});

// ============================================
// 관리자 API
// ============================================

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

// POST /api/admin/login — 관리자 로그인
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });
  }

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// GET /api/admin/sessions — 전체 세션 목록
app.get('/api/admin/sessions', adminAuth, (req, res) => {
  const sessions = getSessions.all();
  res.json({ sessions });
});

// GET /api/admin/sessions/:sessionId — 특정 세션 대화 기록
app.get('/api/admin/sessions/:sessionId', adminAuth, (req, res) => {
  const { sessionId } = req.params;
  const messages = getSessionMessages.all(sessionId);

  // 탭별로 그룹핑
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

// ============================================
// 서버 시작
// ============================================
app.listen(PORT, () => {
  console.log(`\n🚀 실습 도우미 서버가 시작되었습니다!`);
  console.log(`   학생 페이지: http://localhost:${PORT}`);
  console.log(`   관리자 페이지: http://localhost:${PORT}/admin.html\n`);
});
