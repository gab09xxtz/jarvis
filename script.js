// JARVIS Neural Interface - Minimal UI

const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
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

// ===== Neural Network =====
let nodes = [];
let links = [];
const NODE_COUNT = 110;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function initNetwork() {
    if (!canvas || !ctx) return;
    nodes = [];
    links = [];
    const w = canvas.width;
    const h = canvas.height;

    for (let i = 0; i < NODE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Math.min(w, h) * 0.4;
        nodes.push({
            x: w / 2 + Math.cos(angle) * radius * (0.25 + Math.random() * 0.75),
            y: h * 0.42 + Math.sin(angle) * radius * (0.25 + Math.random() * 0.75),
            vx: (Math.random() - 0.5) * 0.55,
            vy: (Math.random() - 0.5) * 0.55,
            r: 1.3 + Math.random() * 2.6,
            pulse: Math.random() * Math.PI * 2
        });
    }

    for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            if (Math.sqrt(dx * dx + dy * dy) < 145) links.push({ a: i, b: j });
        }
    }
}

function drawNetwork() {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w/2, h*0.42, 10, w/2, h*0.42, Math.min(w,h)*0.42);
    g.addColorStop(0, `rgba(0,229,255,${0.1*intensity})`);
    g.addColorStop(0.5, `rgba(0,180,255,${0.035*intensity})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const link of links) {
        const a = nodes[link.a];
        const b = nodes[link.b];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 155) continue;
        const alpha = (1 - dist/155) * 0.48 * intensity;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(0,220,255,${alpha})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
    }

    for (const n of nodes) {
        n.x += n.vx * intensity;
        n.y += n.vy * intensity;
        n.pulse += 0.045 * intensity;

        const cx = w/2, cy = h*0.42;
        const maxR = Math.min(w,h) * 0.44;
        const dx = n.x - cx, dy = n.y - cy;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > maxR) {
            n.vx -= dx * 0.0012;
            n.vy -= dy * 0.0012;
        }

        const glow = 0.55 + Math.sin(n.pulse) * 0.35;
        const r = n.r * (0.9 + intensity * 0.2);

        ctx.beginPath();
        ctx.arc(n.x, n.y, r*3.6, 0, Math.PI*2);
        ctx.fillStyle = `rgba(0,229,255,${0.1*glow*intensity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(195,250,255,${0.88+glow*0.12})`;
        ctx.fill();
    }

    requestAnimationFrame(drawNetwork);
}

function setNetworkState(state) {
    if (state === 'listening') intensity = 2.0;
    else if (state === 'speaking') intensity = 2.5;
    else intensity = 1;
}

setInterval(() => {
    if (!neuronCountEl) return;
    neuronCountEl.textContent = (495 + Math.floor(Math.random()*55) + Math.floor(intensity*18)) + ' neuroni online';
}, 2000);

try {
    resizeCanvas();
    initNetwork();
    drawNetwork();
    window.addEventListener('resize', () => { resizeCanvas(); initNetwork(); });
} catch(e) { console.warn(e); }

// ===== ElevenLabs TTS =====
function cleanupAudio() {
    if (activeAudio) {
        activeAudio.onended = null;
        activeAudio.onerror = null;
        activeAudio.pause();
        activeAudio.src = '';
        activeAudio = null;
    }
    if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
        activeAudioUrl = null;
    }
}

function speakWithBrowserFallback(text) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            resolve();
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'it-IT';
        utterance.rate = 0.92;
        utterance.pitch = 0.9;
        utterance.volume = 1;
        utterance.onend = resolve;
        utterance.onerror = (event) => {
            if (event.error === 'canceled' || event.error === 'interrupted') resolve();
            else reject(new Error(`Fallback TTS: ${event.error || 'errore'}`));
        };
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
    });
}

async function playMp3Blob(blob, token) {
    if (token !== ttsGeneration) return;
    cleanupAudio();
    activeAudioUrl = URL.createObjectURL(blob);
    const audio = new Audio(activeAudioUrl);
    activeAudio = audio;
    audio.preload = 'auto';

    await new Promise((resolve, reject) => {
        const onDone = (error) => {
            if (activeAudio === audio) activeAudio = null;
            if (activeAudioUrl) {
                URL.revokeObjectURL(activeAudioUrl);
                activeAudioUrl = null;
            }
            error ? reject(error) : resolve();
        };
        audio.onended = () => onDone();
        audio.onerror = () => onDone(new Error('Impossibile riprodurre l’audio del worker.'));
        audio.play().catch(onDone);
    });
}

async function processTtsQueue() {
    if (ttsPlaying || TTS_QUEUE.length === 0) return;

    const text = TTS_QUEUE.shift();
    const token = ttsGeneration;
    ttsPlaying = true;
    isSpeaking = true;
    setStatus('speaking', 'ELABORAZIONE VOCALE');
    setNetworkState('speaking');
    ttsAbortController = new AbortController();

    try {
        const response = await fetch(TTS_WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({ text, voice_id: TTS_VOICE_ID }),
            signal: ttsAbortController.signal
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`TTS worker HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('audio') && !contentType.includes('mpeg') && !contentType.includes('octet-stream')) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Risposta worker non audio (${contentType || 'Content-Type assente'})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
        }

        const blob = await response.blob();
        if (!blob.size) throw new Error('Il worker ha restituito un audio vuoto.');
        await playMp3Blob(blob, token);
    } catch (error) {
        if (error.name === 'AbortError' || token !== ttsGeneration) return;
        console.error('[Jarvis TTS] ElevenLabs non disponibile:', error);
        try {
            await speakWithBrowserFallback(text);
        } catch (fallbackError) {
            console.error('[Jarvis TTS] Fallback non disponibile:', fallbackError);
        }
    } finally {
        if (token === ttsGeneration) {
            ttsAbortController = null;
            ttsPlaying = false;
            isSpeaking = false;
            setStatus('idle', 'SISTEMI IN ATTESA');
            setNetworkState('idle');
            if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
            if (TTS_QUEUE.length > 0) processTtsQueue();
        }
    }
}

function interruptTts() {
    ttsGeneration += 1;
    TTS_QUEUE.length = 0;
    if (ttsAbortController) {
        ttsAbortController.abort();
        ttsAbortController = null;
    }
    cleanupAudio();
    if (window.speechSynthesis) speechSynthesis.cancel();
    ttsPlaying = false;
    isSpeaking = false;
    setStatus('idle', 'SISTEMI IN ATTESA');
    setNetworkState('idle');
    if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
}

function speak(text) {
    const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;
    TTS_QUEUE.push(cleanText);
    processTtsQueue();
}

// ===== Speech =====
function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'it-IT';
    r.continuous = false;
    r.interimResults = false;
    r.onstart = () => {
        isListening = true;
        setStatus('listening', 'IN ASCOLTO');
        setNetworkState('listening');
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
    if (isSpeaking) interruptTts();
    if (recognition && !isListening) {
        try { recognition.start(); } catch(e) {}
    }
}

function stopListening() {
    isListening = false;
    setStatus('idle', 'SISTEMI IN ATTESA');
    setNetworkState('idle');
    if (micBtn) micBtn.classList.remove('listening');
    if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
}

function setStatus(type, text) {
    if (statusEl) statusEl.className = 'status ' + type;
    if (statusText) statusText.textContent = text;
}

function showReply(text) {
    if (lastReplyEl) {
        lastReplyEl.style.opacity = '0';
        setTimeout(() => {
            lastReplyEl.textContent = text;
            lastReplyEl.style.opacity = '1';
        }, 150);
    }
}

function reply(text) {
    showReply(text);
    speak(text);
}

// ===== Gemini =====
async function askGemini(msg) {
    try {
        setStatus('speaking', 'ELABORAZIONE NEURALE');
        setNetworkState('speaking');
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Sei J.A.R.V.I.S. Rispondi in italiano, breve e formale (usa signore). Max 2-3 frasi.\n\nDomanda: ' + msg }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 220 }
            })
        });
        if (!res.ok) {
            if (res.status === 503) return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
            return 'Non riesco a contattare i sistemi avanzati al momento.';
        }
        const data = await res.json();
        if (data.error) return 'I sistemi AI sono momentaneamente non disponibili.';
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ? text.trim() : 'Nessuna risposta ricevuta.';
    } catch (e) {
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
