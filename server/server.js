import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

// 1〜100 の整数プール（未使用の番号）
const available = new Set(Array.from({ length: 100 }, (_, i) => i + 1));
// 誰に何番を割り当てたか（socket.id -> number）
const assigned = new Map(); 
// ユーザー名（任意、拡張用）
const names = new Map();

function pickRandomFromSet(s) {
  // MDNの Math.random を使って 0..size-1 のインデックスを決める
  const index = Math.floor(Math.random() * s.size); // 0..size-1（均等） :contentReference[oaicite:3]{index=3}
  let i = 0;
  for (const v of s) {
    if (i === index) return v;
    i++;
  }
  return null;
}

io.on('connection', socket => {
  // ログイン: { name: string }
  socket.on('login', (payload) => {
    const name = String(payload?.name || 'guest').slice(0, 32);
    socket.data.username = name;
    names.set(socket.id, name);

    // すでに割り当て済みなら再送だけ（リロード等に備える）
    if (assigned.has(socket.id)) {
      const number = assigned.get(socket.id);
      socket.emit('roll', { number, username: name, ts: Date.now() }); // 個別送信（socket.emit） :contentReference[oaicite:4]{index=4}
      return;
    }

    if (available.size === 0) {
      socket.emit('roll:error', { message: '番号が満杯です（100人まで）。' });
      return;
    }

    const number = pickRandomFromSet(available);
    available.delete(number);           // プールから取り除く（Set は値が一意） :contentReference[oaicite:5]{index=5}
    assigned.set(socket.id, number);    // この socket に紐づけ

    socket.emit('roll', { number, username: name, ts: Date.now() }); // 自分だけに通知
  });

  // 入力欄の内容を受け取り、必要なら保存/検証
  socket.on('note:update', (payload = {}) => {
    const text = String(payload.text ?? '').slice(0, 200);
    socket.data.note = text;                // 簡易保存
    socket.emit('note:updated', { ok: true }); // 送信者だけに ACK
  });

  // 切断時に番号をプールへ戻す
  socket.on('disconnect', () => {
    if (assigned.has(socket.id)) {
      available.add(assigned.get(socket.id));
      assigned.delete(socket.id);
    }
    names.delete(socket.id);
    // disconnect/disconnecting などのイベントは Socket.IO の Socket インスタンスに存在します。:contentReference[oaicite:6]{index=6}
  });
});

app.get('/', (_req, res) => res.send('BoardGame server running'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
