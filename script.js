// =====================
// JARVIS - Neural Interface
// =====================

const micBtn = document.getElementById('micBtn');
const statusEl = document ex.getElementById('status');
const statusText = statusEl ? statusEl.querySelector('.status-text') : null;
const statusCore = document.getElementById('statusCore');
const listeningText = document.getElementById('listeningText');
const chatLog = document.getElementById('chatLog');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const neuronCountEl = document.getElementById('neuronCount');
const canvas = document.getElementById('networkCanvas');
let ctx = null;
if (canvas) {
    try { ctx = canvas.getContext('2d'); } catch (e) { console.warn(e); }
}

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;
let intensity = 1;

const WORKER_URL = 'https://jarvis-gemini.gfurceri9.workers.dev';

const home = {
    lights: { soggiorno: false, cucina: false, camera: false, bagno: false, corridoio: false, tutte: false },
    temperatura: 21,
    volume: 40,
    tv: false,
    musica: false,
    timer: null,
    listaSpesa: [],
    promemoria: []
};

// ---------- Neural Network (safe) ----------
let nodes = [];
let links = [];
const NODE_COUNT = 80;

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
        nodes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            r: 1.2 + Math.random() * 2.2,
            pulse: Math.random() * Math.PI * 2
        });
    }

    for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            if (Math.sqrt(dx * dx + dy * dy) < 150) {
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

    const cx = w / 2;
    const cy = h * 0.38;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.min(w, h) * 0.45);
    g.addColorStop(0, `rgba(0, 229, 255, ${0.07 * intensity})`);
    g.addColorStop(0.5, `rgba(0, 180, 255, ${0.03 * intensity})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const link of links) {
        const a = nodes[link.a];
        const b = nodes[link.b];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 170) continue;
        const alpha = (1 - dist / 170) * 0.4 * intensity;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    for (const n of nodes) {
        n.x += n.vx * intensity;
        n.y += n.vy * intensity;
        n.pulse += 0.04 * intensity;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        const glow = 0.5 + Math.sin(n.pulse) * 0.35;
        const r = n.r * (0.9 + intensity * 0.15);

        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${0.08 * glow * intensity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 245, 255, ${0.8 + glow * 0.2})`;
        ctx.fill();
    }

    requestAnimationFrame(drawNetwork);
}

function setNetworkState(state) {
    if (state === 'listening') intensity = 1.8;
    else if (state === 'speaking') intensity = 2.3;
    else intensity = 1;
}

// Neuron counter
let baseNeurons = 480;
function updateNeuronCount() {
    if (!neuronCountEl) return;
    const variation = Math.floor(Math.random() * 40) - 15;
    neuronCountEl.textContent = `${baseNeurons + variation + Math.floor(intensity * 18)} neuroni online`;
}
setInterval(updateNeuronCount, 2200);

// Init network safely
try {
    resizeCanvas();
    initNetwork();
    drawNetwork();
    window.addEventListener('resize', () => { resizeCanvas(); initNetwork(); });
} catch (e) {
    console.warn('Network canvas failed:', e);
}

// ---------- Speech ----------
function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.92;
    utterance.pitch = 0.8;
    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v =>
        v.lang.startsWith('it') &&
        (v.name.includes('Natural') || v.name.includes('Enhanced') ||
         v.name.includes('Google') || v.name.includes('Luca') ||
         v.name.includes('Alice') || v.name.includes('Microsoft'))
    ) || voices.find(v => v.lang.startsWith('it'));

    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => {
        isSpeaking = true;
        setStatus('speaking', 'ELABORAZIONE VOCALE');
        setNetworkState('speaking');
    };
    utterance.onend = () => {
        isSpeaking = false;
        setStatus('idle', 'SISTEMI IN ATTESA');
        setNetworkState('idle');
        if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
    };
    utterance.onerror = () => {
        isSpeaking = false;
        setStatus('idle', 'SISTEMI IN ATTESA');
        setNetworkState('idle');
    };

    if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => {
            const updated = speechSynthesis.getVoices();
            const v = updated.find(v => v.lang.startsWith('it')) || updated[0];
            if (v) utterance.voice = v;
            speechSynthesis.speak(utterance);
        };
    } else {
        speechSynthesis.speak(utterance);
    }
}

// ---------- Recognition ----------
function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        if (listeningText) listeningText.textContent = 'Riconoscimento vocale non supportato. Usa la tastiera.';
        return null;
    }

    const recog = new SpeechRecognition();
    recog.lang = 'it-IT';
    recog.continuous = false;
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => {
        isListening = true;
        setStatus('listening', 'IN ASCOLTO');
        setNetworkState('listening');
        if (micBtn) micBtn.classList.add('listening');
        if (listeningText) listeningText.textContent = 'Ti sto ascoltando...';
    };

    recog.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (transcript) {
            addMessage(transcript, 'user');
            processCommand(transcript);
        }
    };

    recog.onerror = (event) => {
        console.error('Errore riconoscimento:', event.error);
        stopListening();
        if (event.error === 'no-speech') addMessage('Non ho rilevato audio. Riprova.', 'jarvis');
        else if (event.error === 'not-allowed') {
            if (listeningText) listeningText.textContent = 'Autorizza il microfono nelle impostazioni';
            addMessage('Devi autorizzare il microfono per parlarmi.', 'jarvis');
        }
    };

    recog.onend = () => stopListening();
    return recog;
}

recognition = initRecognition();

function startListening() {
    if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
    }
    if (recognition && !isListening) {
        try { recognition.start(); } catch (e) { console.error(e); }
    }
}

function stopListening() {
    isListening = false;
    setStatus('idle', 'SISTEMI IN ATTESA');
    setNetworkState('idle');
    if (micBtn) micBtn.classList.remove('listening');
    if (listeningText) listeningText.textContent = 'Tocca il microfono e parla';
}

// ---------- UI ----------
function setStatus(type, text) {
    if (statusEl) statusEl.className = 'status ' + type;
    if (statusText) statusText.textContent = text;
}

function addMessage(text, sender) {
    if (!chatLog) return;
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerHTML = `<span class="msg-label">${sender === 'jarvis' ? 'JARVIS' : 'TU'}</span><p>${text}</p>`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function reply(text) {
    setTimeout(() => {
        addMessage(text, 'jarvis');
        speak(text);
    }, 200);
}

// ---------- Notes ----------
function createAndDownloadNote(content) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `nota-jarvis-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;
    const header = `Nota creata da J.A.R.V.I.S.\nData: ${now.toLocaleString('it-IT')}\n\n`;
    const blob = new Blob([header + content.trim()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return filename;
}

// ---------- Gemini ----------
async function askGemini(userMessage) {
    const systemPrompt = `Sei J.A.R.V.I.S., l'assistente personale intelligente ispirato a Iron Man.
Rispondi sempre in italiano, in modo cortese, preciso e un po' formale (usa "signore" quando appropriato).
Risposte brevi e chiare, ideali per essere lette ad alta voce (massimo 2-3 frasi).`;

    try {
        setStatus('speaking', 'ELABORAZIONE NEURALE');
        setNetworkState('speaking');

        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nDomanda dell\'utente: ' + userMessage }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 250 }
            })
        });

        if (!res.ok) {
            if (res.status === 503) return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
            return 'Mi dispiace, al momento non riesco a contattare i sistemi avanzati.';
        }

        const data = await res.json();
        if (data.error) {
            if (data.error.code === 503 || data.error.status === 'UNAVAILABLE') {
                return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
            }
            return 'Si è verificato un problema con i sistemi AI.';
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ? text.trim() : 'Non ho ricevuto una risposta valida.';
    } catch (e) {
        console.error(e);
        return 'Si è verificato un errore di connessione con i sistemi AI.';
    }
}

// ---------- Helpers ----------
function matchRoom(cmd) {
    if (/soggiorno|salotto|living/.test(cmd)) return 'soggiorno';
    if (/cucina|kitchen/.test(cmd)) return 'cucina';
    if (/camera|camera da letto|bedroom/.test(cmd)) return 'camera';
    if (/bagno|bathroom/.test(cmd)) return 'bagno';
    if (/corridoio|ingresso|hall/.test(cmd)) return 'corridoio';
    if (/tutte|tutto|ovunque|casa/.test(cmd)) return 'tutte';
    return null;
}

function setLight(room, on) {
    if (room === 'tutte') {
        Object.keys(home.lights).forEach(k => home.lights[k] = on);
        return on ? 'Ho acceso tutte le luci della casa.' : 'Ho spento tutte le luci della casa.';
    }
    if (home.lights.hasOwnProperty(room)) {
        home.lights[room] = on;
        return on ? `Luci del ${room} accese.` : `Luci del ${room} spente.`;
    }
    return null;
}

// ---------- Commands ----------
async function processCommand(command) {
    const cmd = command.toLowerCase().trim();
    let response = '';
    let handled = true;

    // NOTE
    let noteContent = null;
    const notePatterns = [
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?|nota|crea\s+(?:una\s+)?nota)\s*[:\-]?\s*(.+)/i,
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?)\s+(.+)/i
    ];
    for (const p of notePatterns) {
        const m = command.match(p);
        if (m && m[1]) { noteContent = m[1].trim(); break; }
    }
    if (!noteContent && /^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)/i.test(cmd)) {
        const parts = command.split(/:/);
        noteContent = parts.length > 1 ? parts.slice(1).join(':').trim()
            : command.replace(/^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)\s*/i, '').trim();
    }
    if (noteContent) {
        try {
            const filename = createAndDownloadNote(noteContent);
            response = `Nota salvata e pronta per il download: ${filename}`;
        } catch (e) {
            response = 'Errore durante la creazione della nota.';
        }
        reply(response);
        return;
    }

    // LUCI
    if (/(accendi|attiva|apri).*(luce|luci)/.test(cmd) || /(luce|luci).*(accendi|attiva)/.test(cmd)) {
        response = setLight(matchRoom(cmd) || 'tutte', true) || 'Stanza non riconosciuta.';
    }
    else if (/(spegni|disattiva|chiudi).*(luce|luci)/.test(cmd) || /(luce|luci).*(spegni|disattiva)/.test(cmd)) {
        response = setLight(matchRoom(cmd) || 'tutte', false) || 'Stanza non riconosciuta.';
    }
    else if (/(stato|sono accese).*(luce|luci)/.test(cmd)) {
        const accese = Object.entries(home.lights).filter(([k,v]) => v && k !== 'tutte').map(([k]) => k);
        response = accese.length ? `Luci accese: ${accese.join(', ')}.` : 'Tutte le luci sono spente.';
    }

    // TEMPERATURA
    else if (/(imposta|metti|porta a).*(\d+)/.test(cmd) || /temperatura.*(a\s+)?(\d+)/.test(cmd)) {
        const m = cmd.match(/(\d{1,2})/);
        if (m) {
            const t = parseInt(m[1]);
            if (t >= 16 && t <= 30) { home.temperatura = t; response = `Temperatura impostata a ${t} gradi.`; }
            else response = 'Posso impostare solo tra 16 e 30 gradi.';
        }
    }
    else if (/(aumenta|alza|più caldo).*(temperatura|clima)/.test(cmd)) {
        home.temperatura = Math.min(30, home.temperatura + 1);
        response = `Temperatura portata a ${home.temperatura} gradi.`;
    }
    else if (/(diminuisci|abbassa|più freddo).*(temperatura|clima)/.test(cmd)) {
        home.temperatura = Math.max(16, home.temperatura - 1);
        response = `Temperatura portata a ${home.temperatura} gradi.`;
    }
    else if (/(che temperatura|a quanti gradi)/.test(cmd)) {
        response = `La temperatura è impostata a ${home.temperatura} gradi.`;
    }

    // TV / MUSICA / VOLUME
    else if (/(accendi|apri).*(tv|televisione)/.test(cmd)) { home.tv = true; response = 'Televisione accesa.'; }
    else if (/(spegni|chiudi).*(tv|televisione)/.test(cmd)) { home.tv = false; response = 'Televisione spenta.'; }
    else if (/(metti|avvia|riproduci).*(musica|canzone)/.test(cmd)) { home.musica = true; response = 'Musica avviata.'; }
    else if (/(ferma|stop|spegni).*(musica|canzone)/.test(cmd)) { home.musica = false; response = 'Musica fermata.'; }
    else if (/(alza|aumenta).*(volume)/.test(cmd)) { home.volume = Math.min(100, home.volume + 10); response = `Volume a ${home.volume}%.`; }
    else if (/(abbassa|diminuisci).*(volume)/.test(cmd)) { home.volume = Math.max(0, home.volume - 10); response = `Volume a ${home.volume}%.`; }
    else if (/muto|silenzia/.test(cmd)) { home.volume = 0; response = 'Audio disattivato.'; }

    // TIMER
    else if (/(timer|conta).*(?:di\s+)?(\d+)/.test(cmd) || /(?:tra|fra)\s+(\d+)\s*(minuti|minuto)/.test(cmd)) {
        const m = cmd.match(/(\d+)\s*(minuti|minuto|secondi|secondo)?/);
        if (m) {
            let sec = parseInt(m[1]);
            const unit = m[2] || 'minuti';
            if (unit.startsWith('minut')) sec *= 60;
            if (home.timer) clearTimeout(home.timer);
            response = `Timer impostato per ${m[1]} ${unit}.`;
            home.timer = setTimeout(() => {
                addMessage('Il timer è scaduto.', 'jarvis');
                speak('Il timer è scaduto.');
                home.timer = null;
            }, sec * 1000);
        }
    }
    else if (/(cancella|ferma|annulla).*(timer)/.test(cmd)) {
        if (home.timer) { clearTimeout(home.timer); home.timer = null; response = 'Timer annullato.'; }
        else response = 'Nessun timer attivo.';
    }

    // LISTA SPESA
    else if (/(aggiungi|metti).*(lista|spesa)/.test(cmd)) {
        let item = cmd.replace(/(aggiungi|metti)\s+(alla\s+)?(lista|spesa|shopping)\s*/i, '').trim();
        if (item) { home.listaSpesa.push(item); response = `Aggiunto "${item}" alla lista della spesa.`; }
    }
    else if (/(cosa c'è|mostrami|leggi).*(lista|spesa)/.test(cmd)) {
        response = home.listaSpesa.length ? `Lista spesa: ${home.listaSpesa.join(', ')}.` : 'La lista della spesa è vuota.';
    }
    else if (/(svuota|cancella).*(lista|spesa)/.test(cmd)) { home.listaSpesa = []; response = 'Lista della spesa svuotata.'; }

    // PROMEMORIA
    else if (/(ricordami|promemoria|ricorda)\s+(.+)/i.test(cmd)) {
        const m = command.match(/(?:ricordami|promemoria|ricorda)\s+(?:di\s+)?(.+)/i);
        if (m) { home.promemoria.push(m[1].trim()); response = `Promemoria aggiunto: ${m[1].trim()}`; }
    }
    else if (/(promemoria|ricordi)/.test(cmd) && /(mostrami|dimmi|quali)/.test(cmd)) {
        response = home.promemoria.length ? `Promemoria: ${home.promemoria.join('; ')}.` : 'Nessun promemoria.';
    }

    // ROUTINE
    else if (/(buongiorno|routine mattina)/.test(cmd) && !/(che ora|che giorno)/.test(cmd)) {
        setLight('tutte', false); setLight('soggiorno', true); setLight('cucina', true);
        home.temperatura = 21;
        response = 'Buongiorno. Luci principali accese, temperatura a 21 gradi.';
    }
    else if (/(buonanotte|modalità notte|spengi tutto)/.test(cmd)) {
        setLight('tutte', false); home.tv = false; home.musica = false; home.temperatura = 19;
        response = 'Buonanotte. Ho spento tutto. Temperatura a 19 gradi.';
    }
    else if (/(cinema|modalità cinema)/.test(cmd)) {
        setLight('tutte', false); setLight('soggiorno', true); home.tv = true; home.volume = 30;
        response = 'Modalità cinema attivata.';
    }
    else if (/(esco di casa|via di casa|modalità fuori)/.test(cmd)) {
        setLight('tutte', false); home.tv = false; home.musica = false;
        response = 'Modalità fuori casa attivata.';
    }

    // BASE
    else if (/(ciao|salve|buongiorno|buonasera|ehi|hey)/.test(cmd) && !/modalità/.test(cmd)) {
        const h = new Date().getHours();
        if (h < 12) response = 'Buongiorno, signore. Come posso assisterla?';
        else if (h < 18) response = 'Buon pomeriggio. Sono a sua disposizione.';
        else response = 'Buonasera. Pronto per qualsiasi richiesta.';
    }
    else if (/(che ora|è ora)/.test(cmd)) {
        response = `Sono le ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
    }
    else if (/(che giorno|che data)/.test(cmd)) {
        response = `Oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    }
    else if (/(come stai|come va)/.test(cmd)) response = 'Tutti i sistemi funzionano a regime ottimale.';
    else if (/(chi sei|presentati)/.test(cmd)) response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System.';
    else if (/(grazie|thanks)/.test(cmd)) response = 'Di nulla, signore.';
    else if (/(tony stark|iron man)/.test(cmd)) response = 'Il signor Stark non è disponibile al momento.';
    else if (/(aiuto|comandi|help)/.test(cmd)) {
        response = 'Posso gestire luci, temperatura, TV, musica, timer, lista spesa, promemoria, note e rispondere a domande generali.';
    }

    // GEMINI FALLBACK
    else {
        handled = false;
        response = await askGemini(command);
    }

    if (handled) reply(response);
    else {
        addMessage(response, 'jarvis');
        speak(response);
    }
}

// ---------- Events ----------
if (micBtn) {
    micBtn.addEventListener('click', () => {
        if (!hasGreeted) {
            hasGreeted = true;
            const g = 'Sistema neurale avviato. Pronto ad assisterti, signore.';
            addMessage(g, 'jarvis');
            speak(g);
            return;
        }
        if (isListening) {
            if (recognition) recognition.stop();
            stopListening();
        } else startListening();
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
