import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

export default function App() {
  const [username, setUsername] = useState(() =>
    localStorage.getItem('chat-username') || ''
  );
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);

  const socket = useMemo(() => io(SERVER_URL, { autoConnect: false }), []);

  useEffect(() => {
    socket.connect();
    socket.on('history', list => setMessages(list));
    socket.on('message', msg => setMessages(prev => [...prev, msg]));
    return () => {
      socket.off('history');
      socket.off('message');
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function send() {
    const name = username.trim() || 'guest';
    localStorage.setItem('chat-username', name);
    const text = input.trim();
    if (!text) return;
    socket.emit('send', { user: name, text });
    setInput('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-gray-100">
      <header className="p-3 bg-white shadow flex gap-2 items-center">
        <h1 className="text-xl font-bold">💬 React Chat</h1>
        <input
          className="ml-auto border rounded px-3 py-2 text-sm"
          placeholder="Your name"
          value={username}
          onChange={e => setUsername(e.target.value)}
          maxLength={32}
        />
      </header>

      <main className="overflow-y-auto p-4 space-y-3">
        {messages.map(m => (
          <div key={m.id} className="flex flex-col">
            <div className="text-xs text-gray-500">
              <span className="font-semibold">{m.user}</span>
              <span className="ml-2">
                {new Date(m.ts).toLocaleString()}
              </span>
            </div>
            <div className="max-w-[70ch] w-fit bg-white rounded-2xl shadow px-4 py-2">
              {m.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      <footer className="p-3 bg-white border-t flex gap-2">
        <textarea
          className="flex-1 border rounded px-3 py-2 resize-none h-12"
          placeholder="Type a message and press Enter"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={1000}
        />
        <button onClick={send} className="px-4 py-2 rounded bg-black text-white">
          Send
        </button>
      </footer>
    </div>
  );
}
