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

const HISTORY_LIMIT = 50;
let history = [];

io.on('connection', socket => {
  socket.emit('history', history);

  socket.on('send', msg => {
    const message = {
      id: crypto.randomUUID(),
      user: String(msg?.user ?? 'anonymous').slice(0, 32),
      text: String(msg?.text ?? '').slice(0, 1000),
      ts: Date.now()
    };
    if (!message.text) return;

    history.push(message);
    if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);

    io.emit('message', message);
  });
});

app.get('/', (_req, res) => res.send('Chat server running'));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () =>
  console.log(`Server listening on http://localhost:${PORT}`)
);
