import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, Crown, LogIn, Play, QrCode, RotateCcw, Settings, Trophy, Users, XCircle, Zap } from "lucide-react";

/*
  TGIF MULTIPLAYER QUIZ, PLAIN REACT EDITION

  This single-file version is immediately playable in one browser and synchronises
  separate tabs/windows using BroadcastChannel + localStorage. It includes the full
  host and player experience, lobby, QR join link, timed questions, answer locking,
  speed-weighted scoring, round results and final podium.

  To use across different phones on a public URL, replace the storage adapter below
  with Firebase/Supabase realtime calls. The UI and game engine do not need redesigning.
*/

const QUESTIONS = [
  { q: "What is the capital of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: 2 },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Mercury"], answer: 1 },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "Which ocean is the largest?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "Who painted the Mona Lisa?", options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"], answer: 2 },
  { q: "What is the chemical symbol for gold?", options: ["Ag", "Au", "Gd", "Go"], answer: 1 },
  { q: "Which country is home to the pyramids of Giza?", options: ["Greece", "Mexico", "Egypt", "Jordan"], answer: 2 },
  { q: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Leopard", "Gazelle"], answer: 1 },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
  { q: "Which instrument typically has 88 keys?", options: ["Guitar", "Violin", "Piano", "Trumpet"], answer: 2 },
  { q: "What is the largest mammal?", options: ["African elephant", "Blue whale", "Giraffe", "Hippopotamus"], answer: 1 },
  { q: "Which language has the most native speakers?", options: ["English", "Spanish", "Mandarin Chinese", "Hindi"], answer: 2 },
  { q: "What is the square root of 144?", options: ["10", "11", "12", "14"], answer: 2 },
  { q: "Which country hosted the 2016 Summer Olympics?", options: ["China", "Brazil", "Japan", "United Kingdom"], answer: 1 },
  { q: "Which gas do plants mainly absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Hydrogen", "Carbon dioxide"], answer: 3 }
];

const PIN = "241907";
const STORE = `tgif-quiz-${PIN}`;
const CHANNEL = `tgif-channel-${PIN}`;
const ROUND_SECONDS = 20;
const OPTION_COLOURS = ["bg-rose-500 hover:bg-rose-400", "bg-blue-500 hover:bg-blue-400", "bg-amber-500 hover:bg-amber-400", "bg-emerald-500 hover:bg-emerald-400"];

const initialGame = {
  pin: PIN,
  phase: "lobby",
  questionIndex: 0,
  questionStartedAt: null,
  revealAt: null,
  players: {},
  answers: {},
  createdAt: Date.now()
};

function readGame() {
  try { return JSON.parse(localStorage.getItem(STORE)) || initialGame; }
  catch { return initialGame; }
}

function writeGame(next) {
  localStorage.setItem(STORE, JSON.stringify(next));
  try { const c = new BroadcastChannel(CHANNEL); c.postMessage(next); c.close(); } catch {}
  window.dispatchEvent(new CustomEvent("tgif-game", { detail: next }));
}

function subscribeGame(callback) {
  const storage = e => e.key === STORE && callback(readGame());
  const custom = e => callback(e.detail);
  let channel;
  try { channel = new BroadcastChannel(CHANNEL); channel.onmessage = e => callback(e.data); } catch {}
  window.addEventListener("storage", storage);
  window.addEventListener("tgif-game", custom);
  callback(readGame());
  return () => { window.removeEventListener("storage", storage); window.removeEventListener("tgif-game", custom); channel?.close(); };
}

function updateGame(mutator) {
  const current = readGame();
  const next = mutator(structuredClone(current));
  writeGame(next);
  return next;
}

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function rankPlayers(game) {
  return Object.values(game.players).sort((a, b) => b.score - a.score || b.correct - a.correct || a.totalMs - b.totalMs);
}

function scoreAnswer(remainingMs) {
  const fraction = Math.max(0, Math.min(1, remainingMs / (ROUND_SECONDS * 1000)));
  return 500 + Math.round(500 * fraction);
}

function Glass({ children, className = "" }) {
  return <div className={`rounded-3xl border border-white/10 bg-white/[0.07] shadow-2xl backdrop-blur-xl ${className}`}>{children}</div>;
}

function PrimaryButton({ children, className = "", ...props }) {
  return <button className={`rounded-2xl bg-violet-500 px-5 py-3 font-bold text-white shadow-lg shadow-violet-500/20 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40 ${className}`} {...props}>{children}</button>;
}

function QR({ value }) {
  const src = `https://quickchart.io/qr?text=${encodeURIComponent(value)}&size=280&margin=1`;
  return <div className="rounded-2xl bg-white p-3"><img src={src} alt="Join game QR code" className="h-48 w-48" /></div>;
}

export default function App() {
  const [route, setRoute] = useState("home");
  const [game, setGame] = useState(initialGame);
  const [playerId, setPlayerId] = useState(() => sessionStorage.getItem("tgif-player-id") || "");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);
  const [, forceTick] = useState(0);

  useEffect(() => subscribeGame(setGame), []);
  useEffect(() => {
    const id = setInterval(() => forceTick(x => x + 1), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("join") === PIN) setRoute("player");
  }, []);

  const joinUrl = useMemo(() => `${window.location.origin}${window.location.pathname}?join=${PIN}`, []);
  const me = game.players[playerId];
  const question = QUESTIONS[game.questionIndex];
  const remainingMs = game.questionStartedAt ? Math.max(0, ROUND_SECONDS * 1000 - (Date.now() - game.questionStartedAt)) : ROUND_SECONDS * 1000;
  const seconds = Math.ceil(remainingMs / 1000);
  const roundKey = String(game.questionIndex);
  const myAnswer = game.answers?.[roundKey]?.[playerId];
  const players = rankPlayers(game);

  function joinGame() {
    const clean = name.trim().slice(0, 18);
    if (!clean) return;
    const id = uid();
    sessionStorage.setItem("tgif-player-id", id);
    setPlayerId(id);
    updateGame(g => {
      g.players[id] = { id, name: clean, score: 0, correct: 0, totalMs: 0, joinedAt: Date.now() };
      return g;
    });
  }

  function newGame() {
    writeGame({ ...initialGame, createdAt: Date.now() });
    setRoute("host");
  }

  function startQuestion(index = 0) {
    updateGame(g => {
      g.phase = "question";
      g.questionIndex = index;
      g.questionStartedAt = Date.now();
      g.revealAt = null;
      g.answers[String(index)] = {};
      return g;
    });
  }

  function answer(index) {
    if (!me || game.phase !== "question" || myAnswer || remainingMs <= 0) return;
    updateGame(g => {
      const q = QUESTIONS[g.questionIndex];
      const responseMs = Math.max(0, Date.now() - g.questionStartedAt);
      const correct = index === q.answer;
      const points = correct ? scoreAnswer(ROUND_SECONDS * 1000 - responseMs) : 0;
      g.answers[roundKey] ||= {};
      if (g.answers[roundKey][playerId]) return g;
      g.answers[roundKey][playerId] = { option: index, correct, points, responseMs };
      g.players[playerId].score += points;
      g.players[playerId].correct += correct ? 1 : 0;
      g.players[playerId].totalMs += responseMs;
      return g;
    });
  }

  function reveal() {
    updateGame(g => { g.phase = "results"; g.revealAt = Date.now(); return g; });
  }

  function next() {
    if (game.questionIndex >= QUESTIONS.length - 1) updateGame(g => { g.phase = "final"; return g; });
    else startQuestion(game.questionIndex + 1);
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white selection:bg-violet-300/30">
      <div className="pointer-events-none fixed inset-0 overflow-hidden"><div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl"/><div className="absolute -bottom-40 -right-24 h-[30rem] w-[30rem] rounded-full bg-cyan-500/20 blur-3xl"/></div>
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-8">
        <header className="mb-6 flex items-center justify-between">
          <button onClick={() => setRoute("home")} className="flex items-center gap-3 text-left"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500"><Zap/></span><span><b className="block text-lg">TGIF Quiz Live</b><small className="text-slate-400">Play. Think. Win.</small></span></button>
          {route !== "home" && <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm">PIN <b>{PIN}</b></div>}
        </header>

        <AnimatePresence mode="wait">
          {route === "home" && <motion.section key="home" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-4xl text-center"><span className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 px-4 py-2 text-sm text-violet-200"><Trophy className="h-4 w-4"/> 15-question office challenge</span><h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">Welcome to <span className="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text text-transparent">TGIF Quiz Live</span></h1><p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">Host the quiz on the main screen or join as a participant. Correctness and speed determine the ranking.</p><div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2"><button onClick={newGame} className="rounded-3xl bg-violet-500 p-8 text-left transition hover:-translate-y-1 hover:bg-violet-400"><Settings className="mb-8 h-9 w-9"/><b className="block text-2xl">Host game</b><span className="text-violet-100">Control questions and results</span></button><button onClick={() => setRoute("player")} className="rounded-3xl bg-cyan-500 p-8 text-left text-slate-950 transition hover:-translate-y-1 hover:bg-cyan-400"><LogIn className="mb-8 h-9 w-9"/><b className="block text-2xl">Join game</b><span className="text-slate-800">Enter a username and play</span></button></div></div>
          </motion.section>}

          {route === "host" && <motion.section key="host" initial={{opacity:0}} animate={{opacity:1}} className="flex flex-1 flex-col">
            {game.phase === "lobby" && <div className="grid flex-1 items-center gap-6 lg:grid-cols-[.9fr_1.1fr]"><Glass className="flex flex-col items-center p-7"><QR value={joinUrl}/><div className="mt-5 text-xs uppercase tracking-[.25em] text-slate-400">Game PIN</div><div className="text-5xl font-black tracking-[.18em]">{PIN}</div><button onClick={copyLink} className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/10"><Copy className="h-4 w-4"/>{copied ? "Copied" : "Copy join link"}</button></Glass><div><div className="flex items-end justify-between"><div><p className="text-violet-300">Host lobby</p><h2 className="text-4xl font-black sm:text-6xl">Waiting for players</h2></div><div className="flex items-center gap-2 text-slate-300"><Users/> {players.length}</div></div><div className="mt-6 flex min-h-44 flex-wrap content-start gap-3 rounded-3xl border border-white/10 bg-white/5 p-5">{players.length ? players.map(p => <motion.span initial={{scale:.8,opacity:0}} animate={{scale:1,opacity:1}} key={p.id} className="h-fit rounded-full bg-white/10 px-5 py-3 font-bold">{p.name}</motion.span>) : <p className="m-auto text-slate-500">Names will appear here when participants join.</p>}</div><PrimaryButton disabled={!players.length} onClick={() => startQuestion(0)} className="mt-6 flex w-full items-center justify-center gap-2 py-4 text-lg"><Play/> Start quiz</PrimaryButton></div></div>}
            {game.phase === "question" && <div className="flex flex-1 flex-col justify-center"><div className="mb-4 flex justify-between text-sm text-slate-400"><span>Question {game.questionIndex+1} of {QUESTIONS.length}</span><span>{Object.keys(game.answers?.[roundKey] || {}).length} of {players.length} answered</span></div><div className="h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all" style={{width:`${remainingMs/(ROUND_SECONDS*1000)*100}%`}}/></div><div className="my-8 flex items-center justify-between gap-5"><h2 className="text-4xl font-black sm:text-6xl">{question.q}</h2><div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 border-cyan-400 text-3xl font-black">{seconds}</div></div><div className="grid gap-4 sm:grid-cols-2">{question.options.map((o,i)=><div key={o} className={`${OPTION_COLOURS[i]} min-h-28 rounded-2xl p-6 text-2xl font-bold`}><span className="mr-3 opacity-70">{String.fromCharCode(65+i)}</span>{o}</div>)}</div><PrimaryButton onClick={reveal} className="mt-6">Reveal answer and leaderboard</PrimaryButton></div>}
            {game.phase === "results" && <Results game={game} onNext={next} host/>}
            {game.phase === "final" && <Final game={game} onReset={newGame}/>} 
          </motion.section>}

          {route === "player" && <motion.section key="player" initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} className="flex flex-1 flex-col justify-center">
            {!me ? <Glass className="mx-auto w-full max-w-md p-7"><div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-violet-500"><Users/></div><h2 className="text-3xl font-black">Join the game</h2><p className="mt-2 text-slate-400">PIN {PIN}</p><input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&joinGame()} maxLength={18} placeholder="Choose a username" className="mt-6 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-4 outline-none focus:ring-2 focus:ring-violet-400"/><PrimaryButton onClick={joinGame} disabled={!name.trim()} className="mt-3 w-full">Join game</PrimaryButton></Glass> : <PlayerView game={game} me={me} question={question} myAnswer={myAnswer} seconds={seconds} remainingMs={remainingMs} onAnswer={answer}/>} 
          </motion.section>}
        </AnimatePresence>
      </div>
    </main>
  );
}

function PlayerView({ game, me, question, myAnswer, seconds, remainingMs, onAnswer }) {
  if (game.phase === "lobby") return <div className="text-center"><div className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-violet-500/15 text-violet-300"><Users className="h-10 w-10"/></div><h2 className="mt-6 text-4xl font-black">You're in, {me.name}!</h2><p className="mt-3 text-slate-400">Watch the host's screen. The quiz will begin shortly.</p></div>;
  if (game.phase === "results") return <Results game={game} playerId={me.id}/>;
  if (game.phase === "final") return <Final game={game}/>;
  return <div className="mx-auto w-full max-w-4xl"><div className="mb-4 flex justify-between text-sm"><span className="text-slate-400">Question {game.questionIndex+1}/{QUESTIONS.length}</span><b className="text-violet-300">{me.score.toLocaleString()} points</b></div><div className="mb-7 h-2 rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400" style={{width:`${remainingMs/(ROUND_SECONDS*1000)*100}%`}}/></div><div className="mb-7 flex items-center justify-between gap-4"><h2 className="text-3xl font-black sm:text-5xl">{question.q}</h2><div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-4 border-cyan-400 text-2xl font-black">{seconds}</div></div><div className="grid gap-4 sm:grid-cols-2">{question.options.map((o,i)=><button disabled={!!myAnswer||remainingMs<=0} onClick={()=>onAnswer(i)} key={o} className={`${OPTION_COLOURS[i]} min-h-28 rounded-2xl p-5 text-left text-xl font-bold transition disabled:opacity-40`}><span className="mr-3 inline-grid h-9 w-9 place-items-center rounded-xl bg-black/15">{String.fromCharCode(65+i)}</span>{o}</button>)}</div>{myAnswer&&<Glass className="mt-5 p-5 text-center"><CheckCircle2 className="mx-auto mb-2 text-cyan-300"/><b>Answer locked in</b><p className="text-sm text-slate-400">Wait for the host to reveal the result.</p></Glass>}</div>;
}

function Results({ game, host=false, playerId, onNext }) {
  const q=QUESTIONS[game.questionIndex]; const ranking=rankPlayers(game); const mine=game.answers?.[String(game.questionIndex)]?.[playerId];
  return <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center"><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-400/15 text-amber-300"><Trophy/></div><h2 className="mt-4 text-4xl font-black">Round results</h2><p className="mt-2 text-slate-400">Correct answer: <b className="text-white">{q.options[q.answer]}</b></p>{playerId&&<p className={`mt-3 font-bold ${mine?.correct?"text-emerald-300":"text-rose-300"}`}>{mine?.correct?`Correct! +${mine.points} points`:mine?"Incorrect this time":"No answer submitted"}</p>}</div><Glass className="mt-6 space-y-3 p-4">{ranking.slice(0,10).map((p,i)=><div key={p.id} className={`grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 rounded-2xl p-3 ${p.id===playerId?"bg-violet-500/25":"bg-white/5"}`}><div className={`grid h-9 w-9 place-items-center rounded-xl font-black ${i===0?"bg-amber-400 text-slate-950":"bg-white/10"}`}>{i+1}</div><div><b>{p.name}</b><div className="text-xs text-slate-400">{p.correct} correct</div></div><b>{p.score.toLocaleString()}</b></div>)}</Glass>{host&&<PrimaryButton onClick={onNext} className="mt-6">{game.questionIndex===QUESTIONS.length-1?"Show final podium":"Next question"}</PrimaryButton>}</div>;
}

function Final({game,onReset}) { const ranking=rankPlayers(game); return <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center text-center"><Crown className="h-24 w-24 text-amber-300"/><p className="mt-5 uppercase tracking-[.25em] text-violet-300">Quiz complete</p><h2 className="mt-2 text-5xl font-black">Final podium</h2><div className="mt-8 grid w-full gap-4 sm:grid-cols-3">{[1,0,2].map((rank,position)=>{const p=ranking[rank]; if(!p)return null; return <div key={p.id} className={`rounded-3xl p-6 ${rank===0?"bg-amber-400 text-slate-950 sm:-translate-y-5":"bg-white/10"}`}><div className="text-4xl font-black">{rank+1}</div><div className="mt-3 text-xl font-black">{p.name}</div><div>{p.score.toLocaleString()} points</div></div>})}</div>{onReset&&<PrimaryButton onClick={onReset} className="mt-8 flex items-center gap-2"><RotateCcw/> New game</PrimaryButton>}</div>; }
