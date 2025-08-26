import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:3001';

export default function App() {
  const [username, setUsername] = useState(() =>
    localStorage.getItem('board-username') || ''
  );
  const [isJoined, setIsJoined] = useState(false);
  const [number, setNumber] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState(''); // ← 入力欄の状態

  const socket = useMemo(() => io(SERVER_URL, { autoConnect: false }), []);

  useEffect(() => {
    socket.connect();

    socket.on('roll', ({ number }) => {
      setError('');
      setNumber(number);
    });

    socket.on('roll:error', ({ message }) => {
      setError(message || 'エラーが発生しました。');
    });

    // （任意）サーバーからACKが来る場合に備えて
    socket.on('note:updated', ({ ok }) => {
      // console.log('note saved?', ok);
    });

    return () => {
      socket.off('roll');
      socket.off('roll:error');
      socket.off('note:updated');
      socket.disconnect();
    };
  }, [socket]);

  function join() {
    const name = (username || '').trim() || 'guest';
    localStorage.setItem('board-username', name);
    socket.emit('login', { name }); // 自分だけへ割り当て通知が返る（socket.emit / io.emit の違いは公式参照） :contentReference[oaicite:7]{index=7}
    setIsJoined(true);
  }

  function onChangeNote(e) {
    const value = e.target.value;
    setNote(value);              // controlled input（stateが真実の単一ソース）
    socket.emit('note:update', { // 入力のたびにサーバーへ送る（最小実装）
      text: value
    });
  }

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-gray-100">
      <header className="p-3 bg-white shadow flex gap-2 items-center">
        <h1 className="text-xl font-bold">🎲 Unique Number BoardGame</h1>
        {!isJoined ? (
          <>
            <input
              className="ml-auto border rounded px-3 py-2 text-sm"
              placeholder="Your name"
              value={username}
              onChange={e => setUsername(e.target.value)}
              maxLength={32}
            />
            <button onClick={join} className="px-4 py-2 rounded bg-black text-white">
              Join
            </button>
          </>
        ) : (
          <div className="ml-auto text-sm">👤 {username}</div>
        )}
      </header>

      <main className="p-6">
        {!isJoined ? (
          <div className="text-gray-600">名前を入れて「Join」を押してください。</div>
        ) : (
          <>
            {error && <div className="mb-4 text-red-600">{error}</div>}
            <div className="text-2xl">
              {number == null ? '割り当て待ち…' : `あなたの番号： ${number}`}
            </div>
            <div className="mt-6 space-y-2">
              <label className="block text-sm text-gray-600">あなたのメモ</label>
              <input
                type="text"
                className="w-full max-w-md border rounded px-3 py-2"
                placeholder="ここに自由に入力できます"
                value={note}
                onChange={onChangeNote}
                maxLength={200}
              />
              <p className="text-xs text-gray-500">入力はサーバーへ即時送信されます。</p>
            </div>
          </>
        )}
      </main>

<footer className="p-3 bg-white border-t text-sm text-gray-500">
        * 重複防止はサーバー側の Set で管理。切断時に番号はプールへ戻ります（`disconnect` を使用）。
      </footer>
    </div>
  );
}
