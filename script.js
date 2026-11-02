const micBtn = document.getElementById('micBtn');
const statusText = document.getElementById('statusText');
const listeningText = document.getElementById('listeningText');
const lastReplyEl = document.getElementById('lastReply');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const neuronCountEl = document.getElementById('neuronCount');
const canvas = document.getElementById('networkCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;
let intensity = 1;

const WORKER_URL = 'https://jarvis-gemini.gfurceri9.workers.dev';
const TTS_WORKER_URL = 'https://frosty-waterfall-d1b0.gfurceri9.workers.dev/';
const TTS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
const TTS_QUEUE = [];
let ttsPlaying = false;
let ttsGeneration = 0;
let ttsAbortController = null;
let activeAudio = null;
let activeAudioUrl = null;

const home = {
  lights: { soggiorno: false, cucina: false, camera: false, bagno: false, corridoio: false, tutte: false },
  temperatura: 21, volume: 40, tv: false, musica: false, timer: null, listaSpesa: [], promemoria: []
};

// ===== Neural network =====
let nodes = [], links = [];
const NODE_COUNT = 100;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function initNetwork() {
  if (!canvas || !ctx) return;
  nodes = []; links = [];
  const w = canvas.width, h = canvas.height;
  for (let i = 0; i < NODE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.min(w, h) * 0.38;
    nodes.push({
      x: w / 2 + Math.cos(a) * r * (0.3 + Math.random() * 0.7),
      y: h * 0.4 + Math.sin(a) * r * (0.3 + Math.random() * 0.7),
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      r: 1.2 + Math.random() * 2.4,
      pulse: Math.random() * Math.PI * 2
    });
  }
  for (let i = 0; i < NODE_COUNT; i++) {
    for (let j = i + 1; j < NODE_COUNT; j++) {
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < 140) links.push({ a: i, b: j });
    }
  }
}

function drawNetwork() {
  if (!canvas || !ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const g = ctx.createRadialGradient(w / 2, h * 0.4, 8, w / 2, h * 0.4, Math.min(w, h) * 0.42);
  g.addColorStop(0, `rgba(0,232,255,${0.1 * intensity})`);
  g.addColorStop(0.55, `rgba(0,160,220,${0.03 * intensity})`);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (const L of links) {
    const a = nodes[L.a], b = nodes[L.b];
    const dx = a.x - b.x, dy = a.y - b.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 150) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(0,220,255,${(1 - d / 150) * 0.45 * intensity})`;
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }

  for (const n of nodes) {
    n.x += n.vx * intensity;
    n.y += n.vy * intensity;
    n.pulse += 0.04 * intensity;
    const cx = w / 2, cy = h * 0.4, maxR = Math.min(w, h) * 0.42;
    const dx = n.x - cx, dy = n.y - cy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > maxR) { n.vx -= dx * 0.001; n.vy -= dy * 0.001; }
    const glow = 0.55 + Math.sin(n.pulse) * 0.35;
    const r = n.r * (0.9 + intensity * 0.18);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * 3.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,232,255,${0.09 * glow * intensity})`;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,250,255,${0.85 + glow * 0.15})`;
    ctx.fill();
  }
  requestAnimationFrame(drawNetwork);
}

function setNetworkState(state) {
  intensity = state === 'listening' ? 2 : state === 'speaking' ? 2.4 : 1;
}

setInterval(() => {
  if (neuronCountEl) neuronCountEl.textContent = (490 + Math.floor(Math.random() * 50) + Math.floor(intensity * 15)) + ' neuroni online';
}, 2000);

try {
  resizeCanvas();
  initNetwork();
  drawNetwork();
  window.addEventListener('resize', () => { resizeCanvas(); initNetwork(); });
} catch (e) { console.warn(e); }

// ===== Status helpers =====
function setStatus(type, text) {
  if (statusText) {
    statusText.textContent = text;
    statusText.className = 'sys' + (type === 'listening' ? ' on' : type === 'speaking' ? ' talk' : '');
  }
}
function setMicStatus(t) { const el = document.getElementById('micStatus'); if (el) el.textContent = t; }
function setVoiceStatus(t) { const el = document.getElementById('voiceStatus'); if (el) el.textContent = t; }
function setAiStatus(t) { const el = document.getElementById('aiStatus'); if (el) el.textContent = t; }

function showReply(text) {
  if (!lastReplyEl) return;
  lastReplyEl.style.opacity = '0';
  setTimeout(() => { lastReplyEl.textContent = text; lastReplyEl.style.opacity = '1'; }, 120);
}

// ===== TTS =====
function speakWithBrowserFallback(text) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) return reject(new Error('no tts'));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT'; u.rate = 0.92; u.pitch = 0.8;
    const voices = speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('it') && (v.name.includes('Google') || v.name.includes('Natural'))) || voices.find(v => v.lang.startsWith('it'));
    if (v) u.voice = v;
    u.onend = () => resolve();
    u.onerror = (e) => (e.error === 'interrupted' || e.error === 'canceled') ? resolve() : reject(e);
    setVoiceStatus('BROWSER');
    speechSynthesis.speak(u);
  });
}

function stopTtsPlayback() {
  ttsGeneration++;
  TTS_QUEUE.length = 0;
  if (ttsAbortController) { try { ttsAbortController.abort(); } catch (e) {} ttsAbortController = null; }
  if (activeAudio) { try { activeAudio.pause(); activeAudio.src = ''; } catch (e) {} activeAudio = null; }
  if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
  if (window.speechSynthesis) speechSynthesis.cancel();
  ttsPlaying = false; isSpeaking = false;
  setVoiceStatus('READY');
}

async function processTtsQueue() {
  if (ttsPlaying || !TTS_QUEUE.length) return;
  ttsPlaying = true;
  const text = TTS_QUEUE.shift();
  const gen = ttsGeneration;
  isSpeaking = true;
  setStatus('speaking', 'ELABORAZIONE VOCALE');
  setNetworkState('speaking');
  setVoiceStatus('SPEAKING');
  try {
    ttsAbortController = new AbortController();
    const res = await fetch(TTS_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: TTS_VOICE_ID }),
      signal: ttsAbortController.signal
    });
    if (!res.ok) throw new Error('tts ' + res.status);
    const blob = await res.blob();
    if (gen !== ttsGeneration) return;
    activeAudioUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeAudioUrl);
    await new Promise((resolve, reject) => {
      activeAudio.onended = resolve;
      activeAudio.onerror = reject;
      activeAudio.play().catch(reject);
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.warn('ElevenLabs fallback', err);
    try { await speakWithBrowserFallback(text); } catch (e) { console.warn(e); }
  } finally {
    if (activeAudioUrl) { URL.revokeObjectURL(activeAudioUrl); activeAudioUrl = null; }
    activeAudio = null; ttsAbortController = null;
    ttsPlaying = false; isSpeaking = false;
    setStatus('idle', 'SISTEMI IN ATTESA');
    setNetworkState('idle');
    setVoiceStatus('READY');
    if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
    if (TTS_QUEUE.length) processTtsQueue();
  }
}

function speak(text) {
  const t = String(text || '').trim();
  if (!t) return;
  TTS_QUEUE.push(t);
  processTtsQueue();
}

function reply(text) { showReply(text); speak(text); }

// ===== Recognition =====
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'it-IT'; r.continuous = false; r.interimResults = false;
  r.onstart = () => {
    isListening = true;
    setStatus('listening', 'IN ASCOLTO');
    setNetworkState('listening');
    setMicStatus('LISTENING');
    if (micBtn) micBtn.classList.add('listening');
    if (listeningText) listeningText.textContent = 'Ti sto ascoltando...';
  };
  r.onresult = (e) => {
    const t = e.results[0][0].transcript.trim();
    if (t) processCommand(t);
  };
  r.onerror = (e) => {
    stopListening();
    if (e.error === 'no-speech') showReply('Non ho rilevato audio. Riprova.');
    if (e.error === 'not-allowed') showReply('Autorizza il microfono per parlarmi.');
  };
  r.onend = () => stopListening();
  return r;
}
recognition = initRecognition();

function startListening() {
  if (isSpeaking) stopTtsPlayback();
  if (recognition && !isListening) { try { recognition.start(); } catch (e) {} }
}
function stopListening() {
  isListening = false;
  setStatus('idle', 'SISTEMI IN ATTESA');
  setNetworkState('idle');
  setMicStatus('STANDBY');
  if (micBtn) micBtn.classList.remove('listening');
  if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
}

// ===== Gemini =====
async function askGemini(msg) {
  try {
    setStatus('speaking', 'ELABORAZIONE NEURALE');
    setNetworkState('speaking');
    setAiStatus('BUSY');
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Sei J.A.R.V.I.S. Rispondi in italiano, breve e formale (usa signore). Max 2-3 frasi.\n\nDomanda: ' + msg }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 220 }
      })
    });
    const data = await res.json().catch(() => ({}));
    setAiStatus('READY');
    if (!res.ok || data.error) {
      const code = data?.error?.code || res.status;
      if (code === 429) return 'Quota giornaliera di Gemini esaurita. I comandi locali funzionano. Riprova domani.';
      if (code === 503) return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
      return 'Non riesco a contattare i sistemi avanzati al momento.';
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : 'Nessuna risposta ricevuta.';
  } catch (e) {
    setAiStatus('READY');
    return 'Errore di connessione con i sistemi AI.';
  }
}

// ===== Commands =====
function matchRoom(cmd) {
  if (/soggiorno|salotto/.test(cmd)) return 'soggiorno';
  if (/cucina/.test(cmd)) return 'cucina';
  if (/camera/.test(cmd)) return 'camera';
  if (/bagno/.test(cmd)) return 'bagno';
  if (/corridoio|ingresso/.test(cmd)) return 'corridoio';
  if (/tutte|tutto|casa/.test(cmd)) return 'tutte';
  return null;
}
function setLight(room, on) {
  if (room === 'tutte') {
    Object.keys(home.lights).forEach(k => home.lights[k] = on);
    return on ? 'Ho acceso tutte le luci.' : 'Ho spento tutte le luci.';
  }
  if (home.lights[room] !== undefined) {
    home.lights[room] = on;
    return on ? 'Luci del ' + room + ' accese.' : 'Luci del ' + room + ' spente.';
  }
  return null;
}

async function processCommand(command) {
  const cmd = command.toLowerCase().trim();
  let response = '', handled = true;

  const nm = command.match(/(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?|nota)\s*[:\-]?\s*(.+)/i);
  if (nm) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const filename = 'nota-jarvis-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.txt';
    const blob = new Blob(['Nota J.A.R.V.I.S.\n' + now.toLocaleString('it-IT') + '\n\n' + nm[1].trim()], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    reply('Nota salvata: ' + filename);
    return;
  }

  if (/(accendi|attiva).*(luce|luci)/.test(cmd) || /(luce|luci).*(accendi)/.test(cmd))
    response = setLight(matchRoom(cmd) || 'tutte', true) || 'Stanza non riconosciuta.';
  else if (/(spegni|disattiva).*(luce|luci)/.test(cmd))
    response = setLight(matchRoom(cmd) || 'tutte', false) || 'Stanza non riconosciuta.';
  else if (/(imposta|metti).*(\d+).*(grad|temperatura)|temperatura.*(\d+)/.test(cmd)) {
    const m = cmd.match(/(\d{1,2})/);
    if (m) {
      const t = parseInt(m[1]);
      if (t >= 16 && t <= 30) { home.temperatura = t; response = 'Temperatura impostata a ' + t + ' gradi.'; }
      else response = 'Posso impostare solo tra 16 e 30 gradi.';
    }
  } else if (/(che temperatura|a quanti gradi)/.test(cmd))
    response = 'La temperatura e impostata a ' + home.temperatura + ' gradi.';
  else if (/(accendi|apri).*(tv|televisione)/.test(cmd)) { home.tv = true; response = 'Televisione accesa.'; }
  else if (/(spegni|chiudi).*(tv|televisione)/.test(cmd)) { home.tv = false; response = 'Televisione spenta.'; }
  else if (/(metti|avvia).*(musica)/.test(cmd)) { home.musica = true; response = 'Musica avviata.'; }
  else if (/(ferma|stop).*(musica)/.test(cmd)) { home.musica = false; response = 'Musica fermata.'; }
  else if (/(timer|conta).*(\d+)/.test(cmd)) {
    const m = cmd.match(/(\d+)/);
    if (m) {
      if (home.timer) clearTimeout(home.timer);
      response = 'Timer impostato per ' + m[1] + ' minuti.';
      home.timer = setTimeout(() => reply('Il timer e scaduto.'), parseInt(m[1]) * 60 * 1000);
    }
  } else if (/(buongiorno)/.test(cmd) && !/che/.test(cmd)) {
    setLight('soggiorno', true); setLight('cucina', true); home.temperatura = 21;
    response = 'Buongiorno. Luci principali accese, temperatura a 21 gradi.';
  } else if (/(buonanotte)/.test(cmd)) {
    setLight('tutte', false); home.tv = false; home.musica = false; home.temperatura = 19;
    response = 'Buonanotte. Ho spento tutto.';
  } else if (/(ciao|salve|buonasera|ehi)/.test(cmd)) {
    const h = new Date().getHours();
    response = h < 12 ? 'Buongiorno, signore.' : h < 18 ? 'Buon pomeriggio.' : 'Buonasera.';
  } else if (/(che ora)/.test(cmd))
    response = 'Sono le ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '.';
  else if (/(chi sei|presentati)/.test(cmd))
    response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System.';
  else if (/(aiuto|comandi|help)/.test(cmd))
    response = 'Posso gestire luci, temperatura, TV, musica, timer, note e rispondere a domande generali.';
  else if (/(grazie)/.test(cmd))
    response = 'Di nulla, signore.';
  else {
    handled = false;
    response = await askGemini(command);
  }

  if (handled) reply(response);
  else { showReply(response); speak(response); }
}

// ===== Events =====
if (micBtn) {
  micBtn.addEventListener('click', () => {
    if (!hasGreeted) {
      hasGreeted = true;
      reply('Sistema neurale avviato. Pronto ad assisterti, signore.');
      return;
    }
    if (isListening) { if (recognition) recognition.stop(); stopListening(); }
    else startListening();
  });
}
if (sendBtn) {
  sendBtn.addEventListener('click', () => {
    const text = textInput ? textInput.value.trim() : '';
    if (!text) return;
    if (!hasGreeted) hasGreeted = true;
    processCommand(text);
    if (textInput) textInput.value = '';
  });
}
if (textInput) {
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && sendBtn) sendBtn.click();
  });
}
if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
