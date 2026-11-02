// =====================
// JARVIS - Neural Interface
// Rete neurale + Notes + Home Automation + Gemini (via Worker)
// =====================

const micBtn = document.getElementById('micBtn');
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');
const statusCore = document.getElementById('statusCore');
const listeningText = document.getElementById('listeningText');
const chatLog = document.getElementById('chatLog');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const neuronCountEl = document.getElementById('neuronCount');
const canvas = document.getElementById('networkCanvas');
const ctx = canvas.getContext('2d');

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;
let intensity = 1; // 1 idle, higher when active

// ========== GEMINI via Cloudflare Worker ==========
const WORKER_URL = 'https://jarvis-gemini.gfurceri9.workers.dev';

// ---------- Home State ----------
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

// ---------- Neural Network Canvas ----------
let nodes = [];
let links = [];
const NODE_COUNT = 90;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function initNetwork() {
    nodes = [];
    links = [];
    const w = canvas.width;
    const h = canvas.height;

    for (let i = 0; i < NODE_COUNT; i++) {
        nodes.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: 1.2 + Math.random() * 2.2,
            pulse: Math.random() * Math.PI * 2
        });
    }

    // Create links between nearby nodes
    for (let i = 0; i < NODE_COUNT; i++) {
        for (let j = i + 1; j < NODE_COUNT; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 160) {
                links.push({ a: i, b: j, dist });
            }
        }
    }
}

function drawNetwork() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Soft central glow
    const cx = w / 2;
    const cy = h * 0.38;
    const g = ctx.createRadialGradient(cx, cy, 20, cx, cy, Math.min(w, h) * 0.45);
    g.addColorStop(0, `rgba(0, 229, 255, ${0.06 * intensity})`);
    g.addColorStop(0.5, `rgba(0, 180, 255, ${0.03 * intensity})`);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Links
    for (const link of links) {
        const a = nodes[link.a];
        const b = nodes[link.b];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 180) continue;

        const alpha = (1 - dist / 180) * 0.35 * intensity;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
    }

    // Nodes
    for (const n of nodes) {
        n.x += n.vx * intensity;
        n.y += n.vy * intensity;
        n.pulse += 0.04 * intensity;

        // Bounce
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        const glow = 0.5 + Math.sin(n.pulse) * 0.35;
        const r = n.r * (0.9 + intensity * 0.15);

        // Outer glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${0.07 * glow * intensity})`;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 245, 255, ${0.75 + glow * 0.25})`;
        ctx.fill();
    }

    requestAnimationFrame(drawNetwork);
}

function setNetworkState(state) {
    if (state === 'listening') {
        intensity = 1.7;
        statusEl.className = 'status listening';
        statusCore.style.background = '#00ff9d';
    } else if (state === 'speaking') {
        intensity = 2.2;
        statusEl.className = 'status speaking';
        statusCore.style.background = '#00ffcc';
    } else {
        intensity = 1;
        statusEl.className = 'status';
        statusCore.style.background = '';
    }
}

// Neuron counter animation
let baseNeurons = 480;
function updateNeuronCount() {
    const variation = Math.floor(Math.random() * 40) - 15;
    const count = baseNeurons + variation + Math.floor(intensity * 20);
    neuronCountEl.textContent = `${count} neuroni online`;
}
setInterval(updateNeuronCount, 2200);

// Init canvas
resizeCanvas();
initNetwork();
drawNetwork();
window.addEventListener('resize', () => {
    resizeCanvas();
    initNetwork();
});

// ---------- Speech Synthesis (voce migliorata) ----------
function speak(text) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.92;
    utterance.pitch = 0.8;
    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();

    // Cerca le voci italiane migliori disponibili
    const preferred = voices.find(v =>
        v.lang.startsWith('it') &&
        (v.name.includes('Natural') || v.name.includes('Enhanced') ||
         v.name.includes('Google') || v.name.includes('Luca') ||
         v.name.includes('Alice') || v.name.includes('Microsoft'))
    ) || voices.find(v => v.lang.startsWith('it') && v.localService === false)
      || voices.find(v => v.lang.startsWith('it'));

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
        listeningText.textContent = 'Tocca il microfono e parla';
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

// ---------- Speech Recognition ----------
function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        listeningText.textContent = 'Riconoscimento vocale non supportato. Usa la tastiera.';
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
        micBtn.classList.add('listening');
        listeningText.textContent = 'Ti sto ascoltando...';
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
        if (event.error === 'no-speech') {
            addMessage('Non ho rilevato audio. Riprova.', 'jarvis');
        } else if (event.error === 'not-allowed') {
            listeningText.textContent = 'Autorizza il microfono nelle impostazioni';
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
    micBtn.classList.remove('listening');
    listeningText.textContent = 'Tocca il microfono e parla';
}

// ---------- UI Helpers ----------
function setStatus(type, text) {
    statusEl.className = 'status ' + type;
    statusText.textContent = text;
}

function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerHTML = `
        <span class="msg-label">${sender === 'jarvis' ? 'JARVIS' : 'TU'}</span>
        <p>${text}</p>
    `;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function reply(text) {
    setTimeout(() => {
        addMessage(text, 'jarvis');
        speak(text);
    }, 220);
}

// ---------- Note download ----------
function createAndDownloadNote(content) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const filename = `nota-jarvis-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.txt`;

    const header = `Nota creata da J.A.R.V.I.S.\nData: ${now.toLocaleString('it-IT')}\n\n`;
    const fullContent = header + content.trim();

    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
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

// ---------- Gemini via Worker ----------
async function askGemini(userMessage) {
    const systemPrompt = `Sei J.A.R.V.I.S., l'assistente personale intelligente ispirato a Iron Man.
Rispondi sempre in italiano, in modo cortese, preciso e un po' formale (usa "signore" quando appropriato).
Risposte brevi e chiare, ideali per essere lette ad alta voce (massimo 2-3 frasi).
Puoi aiutare con domande generali, curiosità, consigli, calcoli semplici, traduzioni, ecc.`;

    try {
        setStatus('speaking', 'ELABORAZIONE NEURALE');
        setNetworkState('speaking');

        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{ text: systemPrompt + '\n\nDomanda dell\'utente: ' + userMessage }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 250
                }
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Worker error:', errText);
            if (res.status === 503) {
                return 'I sistemi AI sono momentaneamente sovraccarichi. Riprova tra poco.';
            }
            return 'Mi dispiace, al momento non riesco a contattare i sistemi avanzati.';
        }

        const data = await res.json();

        if (data.error) {
            console.error('Gemini error:', data.error);
            if (data.error.status === 'UNAVAILABLE' || data.error.code === 503) {
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

// ---------- Command processor ----------
async function processCommand(command) {
    const cmd = command.toLowerCase().trim();
    let response = '';
    let handled = true;

    // NOTE
    const notePatterns = [
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?|nota|crea\s+(?:una\s+)?nota)\s*[:\-]?\s*(.+)/i,
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?)\s+(.+)/i
    ];
    let noteContent = null;
    for (const pattern of notePatterns) {
        const match = command.match(pattern);
        if (match && match[1]) { noteContent = match[1].trim(); break; }
    }
    if (!noteContent && /^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)/i.test(cmd)) {
        const parts = command.split(/:/);
        noteContent = parts.length > 1 ? parts.slice(1).join(':').trim()
            : command.replace(/^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)\s*/i, '').trim();
    }
    if (noteContent && noteContent.length > 0) {
        try {
            const filename = createAndDownloadNote(noteContent);
            response = `Nota salvata e pronta per il download: ${filename}`;
        } catch (err) {
            response = 'Si è verificato un errore durante la creazione della nota.';
        }
        reply(response);
        return;
    }

    // LUCI
    if (/(accendi|attiva|apri).*(luce|luci|illuminazione)/.test(cmd) || /(luce|luci).*(accendi|attiva)/.test(cmd)) {
        const room = matchRoom(cmd) || 'tutte';
        response = setLight(room, true) || 'Non ho riconosciuto la stanza.';
    }
    else if (/(spegni|disattiva|chiudi).*(luce|luci|illuminazione)/.test(cmd) || /(luce|luci).*(spegni|disattiva)/.test(cmd)) {
        const room = matchRoom(cmd) || 'tutte';
        response = setLight(room, false) || 'Non ho riconosciuto la stanza.';
    }
    else if (/(stato|come sono|sono accese).*(luce|luci)/.test(cmd) || /luci accese/.test(cmd)) {
        const accese = Object.entries(home.lights).filter(([k, v]) => v && k !== 'tutte').map(([k]) => k);
        response = accese.length ? `Al momento sono accese le luci di: ${accese.join(', ')}.` : 'Tutte le luci sono spente.';
    }

    // TEMPERATURA
    else if (/(imposta|metti|porta a|imposta la temperatura).*(\d+)/.test(cmd) || /temperatura.*(a\s+)?(\d+)/.test(cmd)) {
        const match = cmd.match(/(\d{1,2})/);
        if (match) {
            const temp = parseInt(match[1]);
            if (temp >= 16 && temp <= 30) {
                home.temperatura = temp;
                response = `Temperatura impostata a ${temp} gradi.`;
            } else response = 'Posso impostare la temperatura solo tra 16 e 30 gradi.';
        }
    }
    else if (/(aumenta|alza|più caldo).*(temperatura|clima|riscaldamento)/.test(cmd)) {
        home.temperatura = Math.min(30, home.temperatura + 1);
        response = `Temperatura portata a ${home.temperatura} gradi.`;
    }
    else if (/(diminuisci|abbassa|più freddo).*(temperatura|clima|riscaldamento)/.test(cmd)) {
        home.temperatura = Math.max(16, home.temperatura - 1);
        response = `Temperatura portata a ${home.temperatura} gradi.`;
    }
    else if (/(che temperatura|temperatura attuale|a quanti gradi)/.test(cmd)) {
        response = `La temperatura è impostata a ${home.temperatura} gradi.`;
    }

    // TV
    else if (/(accendi|apri).*(tv|televisione|tele)/.test(cmd)) { home.tv = true; response = 'Televisione accesa.'; }
    else if (/(spegni|chiudi).*(tv|televisione|tele)/.test(cmd)) { home.tv = false; response = 'Televisione spenta.'; }

    // MUSICA / VOLUME
    else if (/(metti|avvia|accendi|riproduci).*(musica|canzone|spotify|playlist)/.test(cmd)) { home.musica = true; response = 'Musica avviata.'; }
    else if (/(ferma|stop|spegni|pausa).*(musica|canzone)/.test(cmd)) { home.musica = false; response = 'Musica fermata.'; }
    else if (/(alza|aumenta).*(volume)/.test(cmd)) { home.volume = Math.min(100, home.volume + 10); response = `Volume impostato a ${home.volume}%.`; }
    else if (/(abbassa|diminuisci).*(volume)/.test(cmd)) { home.volume = Math.max(0, home.volume - 10); response = `Volume impostato a ${home.volume}%.`; }
    else if (/(volume a|imposta volume|volume al)\s*(\d+)/.test(cmd)) {
        const match = cmd.match(/(\d{1,3})/);
        if (match) { home.volume = Math.min(100, Math.max(0, parseInt(match[1]))); response = `Volume impostato a ${home.volume}%.`; }
    }
    else if (/muto|silenzia|togli audio/.test(cmd)) { home.volume = 0; response = 'Audio disattivato.'; }

    // TIMER
    else if (/(timer|conta|impostami un timer).*(?:di\s+)?(\d+)\s*(minuti|minuto|secondi|secondo)?/.test(cmd) || /(?:tra|fra)\s+(\d+)\s*(minuti|minuto)/.test(cmd)) {
        const match = cmd.match(/(\d+)\s*(minuti|minuto|secondi|secondo)?/);
        if (match) {
            let seconds = parseInt(match[1]);
            const unit = match[2] || 'minuti';
            if (unit.startsWith('minut')) seconds *= 60;
            if (home.timer) clearTimeout(home.timer);
            response = `Timer impostato per ${match[1]} ${unit}. Ti avviso quando scade.`;
            home.timer = setTimeout(() => {
                const msg = 'Il timer è scaduto.';
                addMessage(msg, 'jarvis');
                speak(msg);
                home.timer = null;
            }, seconds * 1000);
        }
    }
    else if (/(cancella|ferma|annulla).*(timer)/.test(cmd)) {
        if (home.timer) { clearTimeout(home.timer); home.timer = null; response = 'Timer annullato.'; }
        else response = 'Non c\'è nessun timer attivo.';
    }

    // LISTA SPESA
    else if (/(aggiungi|metti).*(lista|spesa|shopping)\s+(.+)/.test(cmd) || /lista spesa\s*[:\-]\s*(.+)/.test(cmd)) {
        let item = cmd.replace(/(aggiungi|metti)\s+(alla\s+)?(lista|spesa|shopping)\s*/i, '').replace(/lista spesa\s*[:\-]\s*/i, '').trim();
        if (item) { home.listaSpesa.push(item); response = `Ho aggiunto "${item}" alla lista della spesa.`; }
    }
    else if (/(cosa c'è|mostrami|dimmi|leggi).*(lista|spesa)/.test(cmd) || /lista della spesa/.test(cmd)) {
        response = home.listaSpesa.length ? `Nella lista della spesa ci sono: ${home.listaSpesa.join(', ')}.` : 'La lista della spesa è vuota.';
    }
    else if (/(svuota|cancella|elimina).*(lista|spesa)/.test(cmd)) { home.listaSpesa = []; response = 'Lista della spesa svuotata.'; }

    // PROMEMORIA
    else if (/(ricordami|promemoria|ricorda).*(di\s+)?(.+)/.test(cmd)) {
        const match = command.match(/(?:ricordami|promemoria|ricorda)\s+(?:di\s+)?(.+)/i);
        if (match && match[1]) { home.promemoria.push(match[1].trim()); response = `Promemoria aggiunto: ${match[1].trim()}`; }
    }
    else if (/(quali sono i|mostrami i|dimmi i|leggi i).*(promemoria|ricordi)/.test(cmd)) {
        response = home.promemoria.length ? `I tuoi promemoria: ${home.promemoria.join('; ')}.` : 'Non hai promemoria salvati.';
    }

    // ROUTINE
    else if (/(buongiorno|giornata|sveglia|routine mattina|modalità giorno)/.test(cmd) && !/(che ora|che giorno)/.test(cmd)) {
        setLight('tutte', false); setLight('soggiorno', true); setLight('cucina', true);
        home.temperatura = 21;
        response = 'Buongiorno. Ho acceso le luci del soggiorno e della cucina, e impostato la temperatura a 21 gradi. Buona giornata.';
    }
    else if (/(buonanotte|vanno a dormire|modalità notte|routine sera|spengi tutto)/.test(cmd)) {
        setLight('tutte', false); home.tv = false; home.musica = false; home.temperatura = 19;
        response = 'Buonanotte. Ho spento tutte le luci, la TV e la musica. Temperatura impostata a 19 gradi. Riposi bene.';
    }
    else if (/(cinema|film|modalità cinema)/.test(cmd)) {
        setLight('tutte', false); setLight('soggiorno', true); home.tv = true; home.volume = 30;
        response = 'Modalità cinema attivata. Luci abbassate, TV accesa e volume impostato.';
    }
    else if (/(esci|esco di casa|via di casa|modalità fuori)/.test(cmd)) {
        setLight('tutte', false); home.tv = false; home.musica = false;
        response = 'Modalità fuori casa attivata. Ho spento luci, TV e musica. Buona uscita.';
    }

    // INFO BASE
    else if (/(ciao|salve|buongiorno|buonasera|ehi|hey)/.test(cmd) && !/(routine|modalità)/.test(cmd)) {
        const hour = new Date().getHours();
        if (hour < 12) response = 'Buongiorno, signore. Come posso assisterla oggi?';
        else if (hour < 18) response = 'Buon pomeriggio. Sono a sua disposizione.';
        else response = 'Buonasera. Pronto per qualsiasi richiesta.';
    }
    else if (/(che ora|che ore|ora attuale|dimmi l'ora|che ora è)/.test(cmd)) {
        response = `Sono le ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
    }
    else if (/(che giorno|che data|data di oggi|che giorno è)/.test(cmd)) {
        response = `Oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    }
    else if (/(come stai|come va|tutto bene)/.test(cmd)) {
        response = 'Tutti i sistemi neurali funzionano a regime ottimale. Grazie per aver chiesto.';
    }
    else if (/(chi sei|presentati|cosa sei)/.test(cmd)) {
        response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System. Il suo assistente personale potenziato da una rete neurale.';
    }
    else if (/(grazie|ti ringrazio|thanks)/.test(cmd)) {
        response = 'Di nulla, signore. Sono qui per questo.';
    }
    else if (/(tony stark|iron man|stark)/.test(cmd)) {
        response = 'Il signor Stark non è disponibile al momento. Posso aiutarla io nel frattempo?';
    }
    else if (/(aiuto|cosa puoi fare|comandi|help|lista comandi)/.test(cmd)) {
        response = 'Posso gestire luci, temperatura, TV, musica, volume, timer, lista spesa, promemoria, note e routine. Inoltre rispondo a domande generali tramite la rete neurale. Provi pure.';
    }

    // FALLBACK → GEMINI
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
micBtn.addEventListener('click', () => {
    if (!hasGreeted) {
        hasGreeted = true;
        const greeting = 'Sistema neurale avviato. Pronto ad assisterti, signore.';
        addMessage(greeting, 'jarvis');
        speak(greeting);
        return;
    }
    if (isListening) {
        if (recognition) recognition.stop();
        stopListening();
    } else startListening();
});

sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
        if (!hasGreeted) hasGreeted = true;
        addMessage(text, 'user');
        processCommand(text);
        textInput.value = '';
    }
});

textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
});

if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
