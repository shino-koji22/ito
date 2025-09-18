import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const themesPath = path.resolve(__dirname, '../web/src/assets/themes.json');

let themes = [];
try {
  const raw = readFileSync(themesPath, 'utf8');
  themes = JSON.parse(raw);
} catch (error) {
  console.error('Failed to load themes:', error);
}

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

// 1〜100 の番号プール（未使用の番号）
const available = new Set(Array.from({ length: 100 }, (_, i) => i + 1));
// 既に払い出した対応（socket.id -> number）
const assigned = new Map();
// ユーザー名（メモ、表示用）
const names = new Map();
const joinOrder = [];
let chairpersonId = null;
let currentChairCandidateId = null;
let gameStarted = false;
let currentTheme = null;

function pickRandomFromSet(s) {
  const index = Math.floor(Math.random() * s.size);
  let i = 0;
  for (const v of s) {
    if (i === index) return v;
    i++;
  }
  return null;
}

function pickRandomTheme() {
  if (!themes.length) return null;
  return themes[Math.floor(Math.random() * themes.length)] || null;
}

function emitChairStatus(targetSocket = null) {
  const payload = chairpersonId
    ? { chairperson: { id: chairpersonId, name: names.get(chairpersonId) || 'guest' } }
    : { chairperson: null };
  if (targetSocket) {
    targetSocket.emit('chair:status', payload);
  } else {
    io.emit('chair:status', payload);
  }
}

function emitThemeState(targetSocket = null) {
  if (!gameStarted || !currentTheme) return;
  const payload = { theme: currentTheme };
  if (targetSocket) {
    targetSocket.emit('game:started', payload);
  } else {
    io.emit('game:started', payload);
  }
}

function askNextChairpersonCandidate() {
  if (gameStarted || chairpersonId || currentChairCandidateId) return;

  for (const id of joinOrder) {
    const candidateSocket = io.sockets.sockets.get(id);
    if (!candidateSocket) continue;
    if (candidateSocket.data.chairAsked) continue;

    currentChairCandidateId = id;
    candidateSocket.data.chairAsked = true;
    candidateSocket.data.awaitingChairAnswer = true;
    candidateSocket.emit('chair:ask', { question: 'あなたは司会者ですか？' });
    break;
  }
}

function getParticipants() {
  return Array.from(io.sockets.sockets.values()).filter(socket => socket.data.joined);
}

function emitParticipantCount(targetSocket = null) {
  const payload = { participants: getParticipants().length };
  if (targetSocket) {
    targetSocket.emit('room:stats', payload);
  } else {
    io.emit('room:stats', payload);
  }
}

function notifyChairOpinionStatus() {
  if (!chairpersonId) return;
  const chairSocket = io.sockets.sockets.get(chairpersonId);
  if (!chairSocket) return;

  const participants = getParticipants();
  const submittedCount = participants.filter(s => s.data.opinionSubmitted).length;
  const allSubmitted = participants.length > 0 && submittedCount === participants.length;

  chairSocket.emit('opinion:status', {
    allSubmitted,
    submittedCount,
    total: participants.length
  });
}

function emitOpinionState(socket) {
  socket.emit('opinion:state', {
    submitted: Boolean(socket.data.opinionSubmitted),
    text: socket.data.opinion || ''
  });
}

io.on('connection', socket => {
  socket.data.chairAsked = false;
  socket.data.awaitingChairAnswer = false;
  socket.data.isChairperson = false;
  socket.data.joined = false;
  socket.data.opinion = '';
  socket.data.opinionSubmitted = false;

  emitParticipantCount(socket);

  socket.on('login', (payload) => {
    const name = String(payload?.name || 'guest').slice(0, 32);
    socket.data.username = name;
    names.set(socket.id, name);
    socket.data.joined = true;
    socket.data.opinionSubmitted = Boolean(socket.data.opinion);

    if (!joinOrder.includes(socket.id)) {
      joinOrder.push(socket.id);
    }

    emitParticipantCount();

    if (assigned.has(socket.id)) {
      const number = assigned.get(socket.id);
      socket.emit('roll', { number, username: name, ts: Date.now() });
      emitChairStatus(socket);
      emitThemeState(socket);
      emitOpinionState(socket);
      notifyChairOpinionStatus();
      askNextChairpersonCandidate();
      return;
    }

    if (gameStarted) {
      socket.emit('roll:error', { message: 'ゲーム開始後に入室したため番号は配布されません。' });
      emitChairStatus(socket);
      emitThemeState(socket);
      emitOpinionState(socket);
      notifyChairOpinionStatus();
      return;
    }

    if (available.size === 0) {
      socket.emit('roll:error', { message: '番号はすべて利用中です（100人まで）。' });
      emitChairStatus(socket);
      emitOpinionState(socket);
      notifyChairOpinionStatus();
      return;
    }

    const number = pickRandomFromSet(available);
    available.delete(number);
    assigned.set(socket.id, number);

    socket.emit('roll', { number, username: name, ts: Date.now() });
    emitChairStatus(socket);
    emitOpinionState(socket);
    notifyChairOpinionStatus();
    askNextChairpersonCandidate();
  });

  socket.on('chair:answer', (payload = {}) => {
    if (!socket.data.awaitingChairAnswer) return;

    socket.data.awaitingChairAnswer = false;
    if (currentChairCandidateId === socket.id) {
      currentChairCandidateId = null;
    }

    const rawAnswer = payload.answer;
    const normalized = String(rawAnswer).toLowerCase();
    const isYes = normalized === 'yes' || normalized === 'y' || rawAnswer === true;

    if (isYes) {
      chairpersonId = socket.id;
      socket.data.isChairperson = true;
      socket.emit('chair:assigned', { ok: true });
      emitChairStatus();
      notifyChairOpinionStatus();
    } else {
      socket.data.isChairperson = false;
      socket.emit('chair:ack', { ok: true });
      if (!chairpersonId) {
        askNextChairpersonCandidate();
      }
    }
  });

  socket.on('chair:start', () => {
    if (socket.id !== chairpersonId || gameStarted) return;

    const theme = pickRandomTheme();
    if (!theme) {
      socket.emit('chair:start:error', { message: 'お題を読み込めませんでした。' });
      return;
    }

    currentTheme = theme;
    gameStarted = true;

    for (const participant of getParticipants()) {
      participant.data.opinion = '';
      participant.data.opinionSubmitted = false;
      participant.emit('opinion:state', { submitted: false, text: '' });
    }

    emitThemeState();
    notifyChairOpinionStatus();
  });

  socket.on('opinion:submit', (payload = {}) => {
    const text = String(payload.text ?? '').trim().slice(0, 400);

    if (!gameStarted) {
      socket.emit('opinion:submitted', { ok: false, message: 'お題の提示を待ってください。' });
      return;
    }

    if (!text) {
      socket.emit('opinion:submitted', { ok: false, message: '意見を入力してください。' });
      return;
    }

    socket.data.opinion = text;
    socket.data.opinionSubmitted = true;
    socket.emit('opinion:submitted', { ok: true, submitted: true });
    notifyChairOpinionStatus();
  });

  socket.on('opinion:collect', () => {
    if (socket.id !== chairpersonId || !gameStarted) return;

    const participants = getParticipants();
    const opinions = participants.map(s => ({
      id: s.id,
      username: names.get(s.id) || 'guest',
      number: assigned.get(s.id) ?? null,
      opinion: s.data.opinion || ''
    }));

    socket.emit('opinion:collected', { opinions });
  });

  socket.on('disconnect', () => {
    socket.data.joined = false;

    if (assigned.has(socket.id)) {
      available.add(assigned.get(socket.id));
      assigned.delete(socket.id);
    }

    if (currentChairCandidateId === socket.id) {
      currentChairCandidateId = null;
    }

    if (chairpersonId === socket.id) {
      chairpersonId = null;
      emitChairStatus();
      if (!gameStarted) {
        askNextChairpersonCandidate();
      }
    }

    const orderIndex = joinOrder.indexOf(socket.id);
    if (orderIndex !== -1) {
      joinOrder.splice(orderIndex, 1);
    }

    names.delete(socket.id);
    notifyChairOpinionStatus();
    emitParticipantCount();
  });
});

app.get('/', (_req, res) => res.send('BoardGame server running'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
