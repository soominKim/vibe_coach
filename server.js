require('dotenv').config();

const path = require('path');
const express = require('express');
const app = require('./api/index');

const PORT = process.env.PORT || 4000;

// 로컬 개발: 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n🚀 실습 도우미 서버가 시작되었습니다!`);
  console.log(`   학생 페이지: http://localhost:${PORT}`);
  console.log(`   관리자 페이지: http://localhost:${PORT}/admin.html\n`);
});
