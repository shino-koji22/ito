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
  const [chairPrompt, setChairPrompt] = useState(null);
  const [isChairperson, setIsChairperson] = useState(false);
  const [chairpersonName, setChairpersonName] = useState('');
  const [participantCount, setParticipantCount] = useState(0);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [theme, setTheme] = useState(null);

  const [opinion, setOpinion] = useState('');
  const [opinionError, setOpinionError] = useState('');
  const [opinionSubmitted, setOpinionSubmitted] = useState(false);
  const [opinionSubmitting, setOpinionSubmitting] = useState(false);

  const [starting, setStarting] = useState(false);
  const [opinionsReady, setOpinionsReady] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectedOpinions, setCollectedOpinions] = useState([]);

  const socket = useMemo(() => io(SERVER_URL, { autoConnect: false }), []);

  useEffect(() => {
    socket.connect();

    socket.on('roll', ({ number: nextNumber }) => {
      setError('');
      setNumber(nextNumber);
    });

    socket.on('roll:error', ({ message }) => {
      setError(message || 'エラーが発生しました。');
    });

    socket.on('chair:ask', ({ question }) => {
      setChairPrompt({
        question: question || 'あなたは司会者ですか？',
        pending: false,
      });
    });

    socket.on('chair:assigned', () => {
      setChairPrompt(null);
      setIsChairperson(true);
      setStarting(false);
    });

    socket.on('chair:ack', () => {
      setChairPrompt(null);
      setIsChairperson(false);
      setStarting(false);
    });

    socket.on('chair:status', ({ chairperson }) => {
      const chairName = chairperson?.name || '';
      setChairpersonName(chairName);
      const isSelf = chairperson?.id === socket.id;
      setIsChairperson(Boolean(chairperson) && isSelf);
      if (chairperson) {
        setChairPrompt(null);
        if (!isSelf) {
          setStarting(false);
          setOpinionsReady(false);
        }
      }
      if (!chairperson) {
        setOpinionsReady(false);
      }
    });

    socket.on('room:stats', ({ participants }) => {
      const count = Number(participants ?? 0);
      setParticipantCount(Number.isFinite(count) ? count : 0);
    });

    socket.on('game:started', ({ theme: payloadTheme }) => {
      setIsGameStarted(true);
      setTheme(payloadTheme || null);
      setStarting(false);
      setOpinion('');
      setOpinionError('');
      setOpinionSubmitted(false);
      setOpinionSubmitting(false);
      setOpinionsReady(false);
      setCollectedOpinions([]);
    });

    socket.on('opinion:state', ({ submitted, text }) => {
      setOpinion(text || '');
      setOpinionSubmitted(Boolean(submitted));
      setOpinionError('');
    });

    socket.on('opinion:submitted', ({ ok, message, submitted }) => {
      setOpinionSubmitting(false);
      if (ok) {
        setOpinionSubmitted(submitted ?? true);
        setOpinionError('');
      } else {
        setOpinionError(message || '意見を送信できませんでした。');
      }
    });

    socket.on('opinion:status', ({ allSubmitted }) => {
      setOpinionsReady(Boolean(allSubmitted));
      if (!allSubmitted) {
        setCollecting(false);
      }
    });

    socket.on('opinion:collected', ({ opinions = [] }) => {
      setCollecting(false);
      setCollectedOpinions(opinions);
    });

    socket.on('chair:start:error', ({ message }) => {
      setStarting(false);
      setError(message || 'スタートに失敗しました。');
    });

    return () => {
      socket.off('roll');
      socket.off('roll:error');
      socket.off('chair:ask');
      socket.off('chair:assigned');
      socket.off('chair:ack');
      socket.off('chair:status');
      socket.off('room:stats');
      socket.off('game:started');
      socket.off('opinion:state');
      socket.off('opinion:submitted');
      socket.off('opinion:status');
      socket.off('opinion:collected');
      socket.off('chair:start:error');
      socket.disconnect();
    };
  }, [socket]);

  function join() {
    const name = (username || '').trim() || 'guest';
    localStorage.setItem('board-username', name);
    setNumber(null);
    setError('');
    setOpinion('');
    setOpinionError('');
    setOpinionSubmitted(false);
    setOpinionSubmitting(false);
    setCollectedOpinions([]);
    setOpinionsReady(false);
    setIsGameStarted(false);
    setTheme(null);
    setCollecting(false);
    setStarting(false);
    setChairPrompt(null);
    setIsJoined(true);
    socket.emit('login', { name });
  }

  function answerChair(isYes) {
    setChairPrompt(prev => (prev ? { ...prev, pending: true } : prev));
    socket.emit('chair:answer', { answer: isYes ? 'yes' : 'no' });
  }

  function startGame() {
    setStarting(true);
    socket.emit('chair:start');
  }

  function submitOpinion() {
    setOpinionError('');
    setOpinionSubmitting(true);
    socket.emit('opinion:submit', { text: opinion });
  }

  function collectOpinions() {
    setCollecting(true);
    socket.emit('opinion:collect');
  }

  const chairLabel = chairpersonName
    ? `司会: ${chairpersonName}${isChairperson ? '（あなた）' : ''}`
    : '司会未決定';

  const opinionHelper = opinionSubmitted
    ? '意見を送信済みです。必要なら再編集して決定できます。'
    : '決定ボタンで意見を送信します。';

  return (
    <div className="h-full grid grid-rows-[auto_1fr_auto] bg-gray-100">
      <header className="p-3 bg-white shadow flex items-center gap-3">
        <h1 className="text-xl font-bold">Unique Number BoardGame</h1>
        <div className="text-sm text-gray-600">{chairLabel}</div>
        <div className="text-sm text-gray-500 whitespace-nowrap">入室中: {participantCount}人</div>
        {isChairperson && !isGameStarted && (
          <button
            type="button"
            onClick={startGame}
            disabled={starting}
            className="ml-4 rounded bg-green-600 px-4 py-2 text-white disabled:opacity-60"
          >
            スタート
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!isJoined ? (
            <>
              <input
                className="border rounded px-3 py-2 text-sm"
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
            <div className="text-sm text-gray-700">
              👤 {username}
              {isChairperson && '（司会）'}
            </div>
          )}
        </div>
      </header>

      <main className="p-6 space-y-6">
        {!isJoined ? (
          <div className="text-gray-600">ログインして「Join」を押してください。</div>
        ) : (
          <>
            {chairPrompt && (
              <div className="max-w-md rounded border border-blue-200 bg-blue-50 p-4">
                <p className="font-medium text-blue-800">{chairPrompt.question}</p>
                <p className="mt-1 text-xs text-blue-700">
                  Yes を選ぶとあなたが司会者に確定します。No の場合は次の人に質問が送られます。
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={chairPrompt.pending}
                    onClick={() => answerChair(true)}
                    className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    disabled={chairPrompt.pending}
                    onClick={() => answerChair(false)}
                    className="rounded border border-blue-600 px-4 py-2 text-blue-600 disabled:opacity-60"
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {error && <div className="text-red-600">{error}</div>}

            <div className="text-2xl">
              {number == null ? '番号を取得中...' : `あなたの番号: ${number}`}
            </div>

            {isGameStarted && theme && (
              <div className="max-w-xl rounded border border-amber-300 bg-amber-50 p-4">
                <div className="text-sm text-amber-700">今回のお題</div>
                <div className="mt-2 text-lg font-semibold text-amber-900">{theme.prompt}</div>
              </div>
            )}

            <div className="max-w-md space-y-2">
              <label className="block text-sm text-gray-600">あなたの意見</label>
              <textarea
                className="h-28 w-full resize-none border rounded px-3 py-2"
                placeholder="お題に対するあなたの意見を記入してください"
                value={opinion}
                onChange={e => setOpinion(e.target.value)}
                maxLength={400}
                disabled={!isGameStarted}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={submitOpinion}
                  disabled={!isGameStarted || opinionSubmitting}
                  className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-60"
                >
                  決定
                </button>
                <span className="text-xs text-gray-500">{opinionHelper}</span>
              </div>
              {opinionError && <p className="text-xs text-red-600">{opinionError}</p>}
            </div>

            {isChairperson && isGameStarted && opinionsReady && (
              <div className="max-w-md rounded border border-emerald-300 bg-emerald-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-emerald-800">全員の意見が揃いました。</span>
                  <button
                    type="button"
                    onClick={collectOpinions}
                    disabled={collecting}
                    className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
                  >
                    意見を収集
                  </button>
                </div>
              </div>
            )}

            {isChairperson && collectedOpinions.length > 0 && (
              <div className="max-w-xl space-y-2 rounded border border-slate-300 bg-white p-4">
                <h2 className="text-base font-semibold text-slate-700">集めた意見</h2>
                <ul className="space-y-1 text-sm text-slate-600">
                  {collectedOpinions.map(item => (
                    <li key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <div className="font-medium text-slate-700">{item.username} {item.number != null ? `(番号: ${item.number})` : ''}</div>
                      <div className="mt-1 whitespace-pre-wrap text-slate-600">{item.opinion}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="p-3 bg-white border-t text-sm text-gray-500">
        * 番号の割り当てはサーバー側の Set 管理。退出時に番号はプールへ戻ります（`disconnect` 利用）。スタート後は新規参加者に番号を配布しません。
      </footer>
    </div>
  );
}
