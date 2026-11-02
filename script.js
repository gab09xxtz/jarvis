// JARVIS Neural Interface - Minimal UI

const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
const listeningText = document.getElementById('listeningText');
const lastReplyEl = document.getElementById('lastReply');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const canvas = document.getElementById('networkCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;

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

// ===== Core: sfera di particelle 3D che reagisce allo stato =====
const TAU = Math.PI * 2;
const STATES = {
    idle:      { amp: 0.025, spin: 0.16, color: [95, 233, 255] },
    listening: { amp: 0.070, spin: 0.38, color: [140, 255, 214] },
    thinking:  { amp: 0.055, spin: 0.90, color: [255, 184, 82] },
    speaking:  { amp: 0.105, spin: 0.30, color: [255, 184, 82] }
};
const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const SPHERE_N = 320, LINK_DIST = 0.24;
let coreState = 'idle', coreSize = 0, lastT = 0, rotY = 0;
let curAmp = STATES.idle.amp, curSpin = STATES.idle.spin, curColor = STATES.idle.color.slice();
const spherePts = [], sphereEdges = [];
const sx = new Float32Array(SPHERE_N), sy = new Float32Array(SPHERE_N), sz = new Float32Array(SPHERE_N);

function buildSphere() {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < SPHERE_N; i++) {
        const y = 1 - (i / (SPHERE_N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
        spherePts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, ph: Math.random() * TAU });
    }
    for (let i = 0; i < SPHERE_N; i++) for (let j = i + 1; j < SPHERE_N; j++) {
        const a = spherePts[i], b = spherePts[j];
        if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < LINK_DIST) sphereEdges.push([i, j]);
    }
}

function resizeCanvas() {
    if (!canvas || !ctx) return;
    const size = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    coreSize = size;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawCore(now) {
    requestAnimationFrame(drawCore);
    if (!ctx || !coreSize) return;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    const time = now / 1000, mo = REDUCE_MOTION ? 0.3 : 1;
    const st = STATES[coreState] || STATES.idle;
    const k = 1 - Math.pow(0.05, dt);
    curAmp += (st.amp * mo - curAmp) * k;
    curSpin += (st.spin * mo - curSpin) * k;
    for (let i = 0; i < 3; i++) curColor[i] += (st.color[i] - curColor[i]) * k;
    rotY += dt * curSpin;

    const S = coreSize, cx = S / 2, cy = S / 2, R = S * 0.34;
    const [cr, cg, cb] = curColor.map(Math.round);
    const rgb = a => `rgba(${cr},${cg},${cb},${a})`;
    const env = coreState === 'speaking' ? 0.55 + 0.45 * Math.sin(time * 7.3) * Math.sin(time * 2.9 + 1.2) : 0;

    ctx.clearRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';

    const halo = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, S / 2);
    halo.addColorStop(0, rgb(0.16)); halo.addColorStop(0.55, rgb(0.05)); halo.addColorStop(1, rgb(0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, S, S);

    const tilt = 0.38 + Math.sin(time * 0.35) * 0.06;
    const cY = Math.cos(rotY), sY = Math.sin(rotY), cX = Math.cos(tilt), sX = Math.sin(tilt);
    for (let i = 0; i < SPHERE_N; i++) {
        const p = spherePts[i];
        const wave = Math.sin(p.y * 6 + time * 2.4) * Math.sin(p.x * 4 - time * 1.7);
        const d = 1 + curAmp * (0.9 * wave + 0.5 * env * Math.sin(p.ph + time * 9));
        const x = p.x * d, y = p.y * d, z = p.z * d;
        const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
        const y2 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
        const persp = 1 / (1 - z2 * 0.22);
        sx[i] = cx + x1 * R * persp; sy[i] = cy + y2 * R * persp; sz[i] = z2;
    }

    const bucket = z => (z > 0.35 ? 2 : z > -0.2 ? 1 : 0);
    const edges = [new Path2D(), new Path2D(), new Path2D()];
    for (const [a, b] of sphereEdges) {
        const path = edges[bucket((sz[a] + sz[b]) / 2)];
        path.moveTo(sx[a], sy[a]); path.lineTo(sx[b], sy[b]);
    }
    ctx.lineWidth = 0.8;
    [0.10, 0.22, 0.42].forEach((a, i) => { ctx.strokeStyle = rgb(a); ctx.stroke(edges[i]); });

    const dots = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < SPHERE_N; i++) {
        const r = S * 0.0035 * (0.7 + (sz[i] + 1) * 0.65);
        const path = dots[bucket(sz[i])];
        path.moveTo(sx[i] + r, sy[i]); path.arc(sx[i], sy[i], r, 0, TAU);
    }
    ctx.fillStyle = rgb(0.25); ctx.fill(dots[0]);
    ctx.fillStyle = rgb(0.6); ctx.fill(dots[1]);
    ctx.fillStyle = `rgba(${(cr + 255) >> 1},${(cg + 255) >> 1},${(cb + 255) >> 1},0.95)`; ctx.fill(dots[2]);

    const pulse = 1 + 0.12 * Math.sin(time * (coreState === 'idle' ? 1.6 : 4.2)) + env * 0.18;
    const cR = R * 0.30 * pulse * 2.2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cR);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.18, rgb(0.85));
    g.addColorStop(0.5, rgb(0.22)); g.addColorStop(1, rgb(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, cR, 0, TAU); ctx.fill();

    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.32);
    ctx.lineWidth = 1; ctx.strokeStyle = rgb(0.38);
    ctx.setLineDash([R * 0.34, R * 0.14]); ctx.lineDashOffset = -time * R * 0.25 * mo;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.2, R * 0.36, 0, 0, TAU); ctx.stroke();
    ctx.restore();
}

function setNetworkState(state) { coreState = STATES[state] ? state : 'idle'; }

try {
    buildSphere();
    resizeCanvas();
    if (window.ResizeObserver && canvas) new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
    else window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(drawCore);
} catch (e) { console.warn(e); }

// ===== ElevenLabs TTS =====
function setVoiceStatus(text) {
    const el = document.getElementById('voiceStatus');
    if (el) el.textContent = text;
}

function speakWithBrowserFallback(text) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('Browser TTS non disponibile'));
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'it-IT';
        utterance.rate = 0.92;
        utterance.pitch = 0.8;
        const voices = speechSynthesis.getVoices();
        const v = voices.find(v => v.lang.startsWith('it') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Luca') || v.name.includes('Alice'))) || voices.find(v => v.lang.startsWith('it'));
        if (v) utterance.voice = v;
        utterance.onend = () => resolve();
        utterance.onerror = (event) => {
            if (event.error === 'interrupted' || event.error === 'canceled') resolve();
            else reject(new Error(`Fallback TTS: ${event.error || 'errore'}`));
        };
        setVoiceStatus('BROWSER');
        speechSynthesis.speak(utterance);
    });
}

function stopTtsPlayback() {
    ttsGeneration += 1;
    TTS_QUEUE.length = 0;
    if (ttsAbortController) {
        try { ttsAbortController.abort(); } catch (e) {}
        ttsAbortController = null;
    }
    if (activeAudio) {
        try { activeAudio.pause(); activeAudio.src = ''; } catch (e) {}
        activeAudio = null;
    }
    if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    ttsPlaying = false;
    isSpeaking = false;
    setVoiceStatus('READY');
}

async function processTtsQueue() {
    if (ttsPlaying || TTS_QUEUE.length === 0) return;
    ttsPlaying = true;
    const text = TTS_QUEUE.shift();
    const generation = ttsGeneration;

    isSpeaking = true;
    setStatus('speaking', 'Parlo');
    setNetworkState('speaking');
    setVoiceStatus('SPEAKING');

    try {
        ttsAbortController = new AbortController();
        const response = await fetch(TTS_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice_id: TTS_VOICE_ID }),
            signal: ttsAbortController.signal
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`TTS worker HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }

        const blob = await response.blob();
        if (generation !== ttsGeneration) return;

        activeAudioUrl = URL.createObjectURL(blob);
        activeAudio = new Audio(activeAudioUrl);
        await new Promise((resolve, reject) => {
            activeAudio.onended = resolve;
            activeAudio.onerror = () => reject(new Error('Audio playback error'));
            activeAudio.play().catch(reject);
        });
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('[Jarvis TTS] ElevenLabs non disponibile:', error);
        try {
            await speakWithBrowserFallback(text);
        } catch (fallbackError) {
            console.error('[Jarvis TTS] Fallback non disponibile:', fallbackError);
        }
    } finally {
        if (activeAudioUrl) {
            URL.revokeObjectURL(activeAudioUrl);
            activeAudioUrl = null;
        }
        activeAudio = null;
        ttsAbortController = null;
        ttsPlaying = false;
        isSpeaking = false;
        setStatus('idle', 'In attesa');
        setNetworkState('idle');
        setVoiceStatus('READY');
        if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
        if (TTS_QUEUE.length > 0) processTtsQueue();
    }
}

function speak(text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return;
    TTS_QUEUE.push(cleanText);
    processTtsQueue();
}

// ===== Recognition =====
function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'it-IT';
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => {
        isListening = true;
        setStatus('listening', 'In ascolto');
        setNetworkState('listening');
        if (micBtn) micBtn.classList.add('listening');
        if (listeningText) listeningText.textContent = 'Ti sto ascoltando...';
        const micStatus = document.getElementById('micStatus');
        if (micStatus) micStatus.textContent = 'LISTENING';
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
    if (recognition && !isListening) {
        try { recognition.start(); } catch(e) {}
    }
}
function stopListening() {
    isListening = false;
    setStatus('idle', 'In attesa');
    setNetworkState('idle');
    if (micBtn) micBtn.classList.remove('listening');
    if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
    const micStatus = document.getElementById('micStatus');
    if (micStatus) micStatus.textContent = 'STANDBY';
}

function setStatus(type, text) {
    if (statusEl) statusEl.className = 'status ' + type;
    if (statusText) statusText.textContent = text;
    document.body.dataset.state = type || 'idle';
}

function showReply(text) {
    if (lastReplyEl) {
        lastReplyEl.style.opacity = '0';
        setTimeout(() => {
            lastReplyEl.textContent = text;
            lastReplyEl.style.opacity = '1';
        }, 150);
    }
    const history = document.getElementById('conversationHistory');
    if (history) {
        const li = document.createElement('li');
        li.textContent = text;
        history.prepend(li);
        while (history.children.length > 8) history.removeChild(history.lastChild);
    }
}

function reply(text) {
    showReply(text);
    speak(text);
}

// ===== Gemini =====
async function askGemini(msg) {
    try {
        setStatus('thinking', 'Elaboro');
        setNetworkState('thinking');
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Sei J.A.R.V.I.S. Rispondi in italiano, breve e formale (usa signore). Max 2-3 frasi.\n\nDomanda: ' + msg }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 220 }
            })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            const code = data?.error?.code || res.status;
            const status = data?.error?.status || '';
            if (code === 429 || status === 'RESOURCE_EXHAUSTED') {
                return 'Quota giornaliera di Gemini esaurita. I comandi locali funzionano comunque. Riprova domani.';
            }
            if (code === 503 || status === 'UNAVAILABLE') {
                return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
            }
            return 'Non riesco a contattare i sistemi avanzati al momento.';
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ? text.trim() : 'Nessuna risposta ricevuta.';
    } catch (e) {
        console.error(e);
        return 'Non riesco a raggiungere l'assistente. Controlla la connessione e riprova.';
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
    let response = '';
    let handled = true;

    let noteContent = null;
    const nm = command.match(/(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?|nota)\s*[:\-]?\s*(.+)/i);
    if (nm) noteContent = nm[1].trim();
    if (noteContent) {
        const now = new Date();
        const pad = n => String(n).padStart(2,'0');
        const filename = 'nota-jarvis-' + now.getFullYear() + pad(now.getMonth()+1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + '.txt';
        const blob = new Blob(['Nota J.A.R.V.I.S.\n' + now.toLocaleString('it-IT') + '\n\n' + noteContent], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        response = 'Nota salvata: ' + filename;
        reply(response);
        return;
    }

    if (/(accendi|attiva).*(luce|luci)/.test(cmd) || /(luce|luci).*(accendi)/.test(cmd)) {
        response = setLight(matchRoom(cmd) || 'tutte', true) || 'Stanza non riconosciuta.';
    } else if (/(spegni|disattiva).*(luce|luci)/.test(cmd)) {
        response = setLight(matchRoom(cmd) || 'tutte', false) || 'Stanza non riconosciuta.';
    } else if (/(imposta|metti).*(\d+).*(grad|temperatura)|temperatura.*(\d+)/.test(cmd)) {
        const m = cmd.match(/(\d{1,2})/);
        if (m) {
            const t = parseInt(m[1]);
            if (t >= 16 && t <= 30) { home.temperatura = t; response = 'Temperatura impostata a ' + t + ' gradi.'; }
            else response = 'Posso impostare solo tra 16 e 30 gradi.';
        }
    } else if (/(che temperatura|a quanti gradi)/.test(cmd)) {
        response = 'La temperatura e impostata a ' + home.temperatura + ' gradi.';
    } else if (/(accendi|apri).*(tv|televisione)/.test(cmd)) { home.tv = true; response = 'Televisione accesa.'; }
    else if (/(spegni|chiudi).*(tv|televisione)/.test(cmd)) { home.tv = false; response = 'Televisione spenta.'; }
    else if (/(metti|avvia).*(musica)/.test(cmd)) { home.musica = true; response = 'Musica avviata.'; }
    else if (/(ferma|stop).*(musica)/.test(cmd)) { home.musica = false; response = 'Musica fermata.'; }
    else if (/(timer|conta).*(\d+)/.test(cmd)) {
        const m = cmd.match(/(\d+)/);
        if (m) {
            let sec = parseInt(m[1]) * 60;
            if (home.timer) clearTimeout(home.timer);
            response = 'Timer impostato per ' + m[1] + ' minuti.';
            home.timer = setTimeout(() => { reply('Il timer e scaduto.'); }, sec*1000);
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
    } else if (/(che ora)/.test(cmd)) {
        response = 'Sono le ' + new Date().toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) + '.';
    } else if (/(chi sei|presentati)/.test(cmd)) {
        response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System.';
    } else if (/(aiuto|comandi|help)/.test(cmd)) {
        response = 'Posso gestire luci, temperatura, TV, musica, timer, note e rispondere a domande generali.';
    } else if (/(grazie)/.test(cmd)) {
        response = 'Di nulla, signore.';
    } else {
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
        if (text) {
            if (!hasGreeted) hasGreeted = true;
            processCommand(text);
            if (textInput) textInput.value = '';
        }
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
