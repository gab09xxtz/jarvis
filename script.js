// JARVIS Neural Interface - Clean version

const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
const listeningText = document.getElementById('listeningText');
const chatLog = document.getElementById('chatLog');
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

const home = {
    lights: { soggiorno: false, cucina: false, camera: false, bagno: false, corridoio: false, tutte: false },
    temperatura: 21, volume: 40, tv: false, musica: false, timer: null, listaSpesa: [], promemoria: []
};

// ===== Neural Network =====
let nodes = [];
let links = [];
const NODE_COUNT = 100;

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

    // Create denser cluster in center
    for (let i = 0; i < NODE_COUNT; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * Math.min(w, h) * 0.38;
        nodes.push({
            x: w / 2 + Math.cos(angle) * radius * (0.3 + Math.random() * 0.7),
            y: h * 0.42 + Math.sin(angle) * radius * (0.3 + Math.random() * 0.7),
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            r: 1.4 + Math.random() * 2.4,
            pulse: Math.random() * Math.PI * 2
        });
    }

    for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            if (Math.sqrt(dx * dx + dy * dy) < 140) {
                links.push({ a: i, b: j });
            }
        }
    }
}

function drawNetwork() {
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Central glow
    const g = ctx.createRadialGradient(w/2, h*0.42, 10, w/2, h*0.42, Math.min(w,h)*0.4);
    g.addColorStop(0, `rgba(0,229,255,${0.09*intensity})`);
    g.addColorStop(0.5, `rgba(0,180,255,${0.03*intensity})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Links
    for (const link of links) {
        const a = nodes[link.a];
        const b = nodes[link.b];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 150) continue;
        const alpha = (1 - dist/150) * 0.45 * intensity;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(0,220,255,${alpha})`;
        ctx.lineWidth = 0.9;
        ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
        n.x += n.vx * intensity;
        n.y += n.vy * intensity;
        n.pulse += 0.045 * intensity;

        // Soft boundary
        const cx = w/2, cy = h*0.42;
        const maxR = Math.min(w,h) * 0.42;
        const dx = n.x - cx, dy = n.y - cy;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d > maxR) {
            n.vx -= dx * 0.001;
            n.vy -= dy * 0.001;
        }

        const glow = 0.55 + Math.sin(n.pulse) * 0.35;
        const r = n.r * (0.9 + intensity * 0.18);

        ctx.beginPath();
        ctx.arc(n.x, n.y, r*3.5, 0, Math.PI*2);
        ctx.fillStyle = `rgba(0,229,255,${0.09*glow*intensity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(190,250,255,${0.85+glow*0.15})`;
        ctx.fill();
    }

    requestAnimationFrame(drawNetwork);
}

function setNetworkState(state) {
    if (state === 'listening') intensity = 1.9;
    else if (state === 'speaking') intensity = 2.4;
    else intensity = 1;
}

// Neuron counter
setInterval(() => {
    if (!neuronCountEl) return;
    const n = 490 + Math.floor(Math.random()*50) + Math.floor(intensity*15);
    neuronCountEl.textContent = n + ' neuroni online';
}, 2000);

// Init
try {
    resizeCanvas();
    initNetwork();
    drawNetwork();
    window.addEventListener('resize', () => { resizeCanvas(); initNetwork(); });
} catch(e) { console.warn(e); }

// ===== Speech =====
function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'it-IT';
    u.rate = 0.92;
    u.pitch = 0.8;
    const voices = speechSynthesis.getVoices();
    const v = voices.find(v => v.lang.startsWith('it') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Luca') || v.name.includes('Alice'))) || voices.find(v => v.lang.startsWith('it'));
    if (v) u.voice = v;
    u.onstart = () => { isSpeaking = true; setStatus('speaking', 'ELABORAZIONE VOCALE'); setNetworkState('speaking'); };
    u.onend = () => { isSpeaking = false; setStatus('idle', 'SISTEMI IN ATTESA'); setNetworkState('idle'); if (listeningText) listeningText.textContent = 'Tocca il microfono e parla'; };
    u.onerror = () => { isSpeaking = false; setStatus('idle', 'SISTEMI IN ATTESA'); setNetworkState('idle'); };
    if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => speechSynthesis.speak(u);
    } else speechSynthesis.speak(u);
}

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
        if (t) { addMessage(t, 'user'); processCommand(t); }
    };
    r.onerror = (e) => {
        stopListening();
        if (e.error === 'no-speech') addMessage('Non ho rilevato audio. Riprova.', 'jarvis');
        if (e.error === 'not-allowed') addMessage('Autorizza il microfono per parlarmi.', 'jarvis');
    };
    r.onend = () => stopListening();
    return r;
}
recognition = initRecognition();

function startListening() {
    if (isSpeaking) { speechSynthesis.cancel(); isSpeaking = false; }
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

function addMessage(text, sender) {
    if (!chatLog) return;
    const div = document.createElement('div');
    div.className = 'message ' + sender;
    div.innerHTML = '<span class="msg-label">' + (sender === 'jarvis' ? 'JARVIS' : 'TU') + '</span><p>' + text + '</p>';
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function reply(text) {
    setTimeout(() => { addMessage(text, 'jarvis'); speak(text); }, 200);
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

    // Notes
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
            home.timer = setTimeout(() => { addMessage('Il timer e scaduto.', 'jarvis'); speak('Il timer e scaduto.'); }, sec*1000);
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
    else { addMessage(response, 'jarvis'); speak(response); }
}

// ===== Events =====
if (micBtn) {
    micBtn.addEventListener('click', () => {
        if (!hasGreeted) {
            hasGreeted = true;
            const g = 'Sistema neurale avviato. Pronto ad assisterti, signore.';
            addMessage(g, 'jarvis');
            speak(g);
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
            addMessage(text, 'user');
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
