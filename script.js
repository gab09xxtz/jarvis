// =====================
// JARVIS - Voice Interface
// Particle Orb + Notes + Home Automation + Gemini AI
// =====================

const micBtn = document.getElementById('micBtn');
const holoCircle = document.getElementById('holoCircle');
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');
const listeningText = document.getElementById('listeningText');
const chatLog = document.getElementById('chatLog');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');
const canvas = document.getElementById('orbCanvas');
const ctx = canvas.getContext('2d');

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;

// ========== GEMINI API ==========
// INCOLLA QUI LA TUA API KEY DI GEMINI (tra gli apici)
const GEMINI_API_KEY = 'AQ.Ab8RN6LbhXjH1O5qDA-ghhhVLM1lwCzP0vc-EEpyh2fZuI0eWQ';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// ---------- Simulated Home State ----------
const home = {
    lights: {
        soggiorno: false,
        cucina: false,
        camera: false,
        bagno: false,
        corridoio: false,
        tutte: false
    },
    temperatura: 21,
    volume: 40,
    tv: false,
    musica: false,
    timer: null,
    listaSpesa: [],
    promemoria: []
};

// ---------- Particle Orb ----------
const PARTICLE_COUNT = 900;
let particles = [];
let rotation = 0;
let rotationSpeed = 0.004;
let targetSpeed = 0.004;
let pulse = 0;
let intensity = 1;

function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
        const theta = Math.PI * (1 + Math.sqrt(5)) * i;
        particles.push({
            x: Math.sin(phi) * Math.cos(theta),
            y: Math.sin(phi) * Math.sin(theta),
            z: Math.cos(phi),
            baseSize: 0.8 + Math.random() * 1.4,
            offset: Math.random() * Math.PI * 2
        });
    }
}

function drawOrb() {
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;

    ctx.clearRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 1.6);
    glow.addColorStop(0, `rgba(0, 240, 255, ${0.08 * intensity})`);
    glow.addColorStop(0.5, `rgba(0, 200, 255, ${0.04 * intensity})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    const projected = particles.map(p => {
        const cosY = Math.cos(rotation);
        const sinY = Math.sin(rotation);
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;

        const tilt = 0.35;
        const cosX = Math.cos(tilt);
        const sinX = Math.sin(tilt);
        let y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        const breathe = 1 + Math.sin(pulse + p.offset) * 0.04 * intensity;
        const scale = radius * breathe;

        return {
            px: cx + x * scale,
            py: cy + y * scale,
            depth: (z + 1.2) / 2.2,
            size: p.baseSize
        };
    });

    projected.sort((a, b) => a.depth - b.depth);

    for (const p of projected) {
        const alpha = 0.25 + p.depth * 0.75;
        const size = p.size * (0.6 + p.depth * 0.9) * (0.9 + intensity * 0.15);

        let r = 0, g = 220, b = 255;
        if (intensity > 1.3) { g = 255; b = 180; }
        if (intensity > 1.8) { r = 0; g = 255; b = 230; }

        ctx.beginPath();
        ctx.arc(p.px, p.py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`;
        ctx.fill();

        if (p.depth > 0.6) {
            ctx.beginPath();
            ctx.arc(p.px, p.py, size * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 255, 255, ${alpha * 0.7})`;
            ctx.fill();
        }
    }

    rotationSpeed += (targetSpeed - rotationSpeed) * 0.08;
    rotation += rotationSpeed;
    pulse += 0.03 * intensity;

    requestAnimationFrame(drawOrb);
}

function setOrbState(state) {
    if (state === 'listening') {
        targetSpeed = 0.018;
        intensity = 1.6;
        holoCircle.classList.add('active');
        holoCircle.classList.remove('speaking');
    } else if (state === 'speaking') {
        targetSpeed = 0.028;
        intensity = 2.1;
        holoCircle.classList.add('speaking');
        holoCircle.classList.remove('active');
    } else {
        targetSpeed = 0.004;
        intensity = 1;
        holoCircle.classList.remove('active', 'speaking');
    }
}

initParticles();
drawOrb();

// ---------- Background particles ----------
function createParticles() {
    const container = document.getElementById('particles');
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 15 + 's';
        p.style.animationDuration = (10 + Math.random() * 15) + 's';
        container.appendChild(p);
    }
}
createParticles();

// ---------- Speech Synthesis ----------
function speak(text) {
    if (!window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    const voices = speechSynthesis.getVoices();
    const italianVoice = voices.find(v =>
        v.lang.startsWith('it') &&
        (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Luca') || v.name.includes('Alice') || v.name.includes('Natural') || v.name.includes('Enhanced'))
    ) || voices.find(v => v.lang.startsWith('it'));

    if (italianVoice) utterance.voice = italianVoice;

    utterance.onstart = () => {
        isSpeaking = true;
        setStatus('speaking', 'Sta parlando...');
        setOrbState('speaking');
    };

    utterance.onend = () => {
        isSpeaking = false;
        setStatus('idle', 'In attesa');
        setOrbState('idle');
        listeningText.textContent = 'Tocca il microfono e parla';
    };

    utterance.onerror = () => {
        isSpeaking = false;
        setStatus('idle', 'In attesa');
        setOrbState('idle');
    };

    if (voices.length === 0) {
        speechSynthesis.onvoiceschanged = () => {
            const updatedVoices = speechSynthesis.getVoices();
            const voice = updatedVoices.find(v => v.lang.startsWith('it')) || updatedVoices[0];
            if (voice) utterance.voice = voice;
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
        setStatus('listening', 'Ti ascolto...');
        setOrbState('listening');
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
            addMessage('Non ho sentito nulla. Prova di nuovo.', 'jarvis');
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
    setStatus('idle', 'In attesa');
    setOrbState('idle');
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
    }, 250);
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

// ---------- Gemini AI ----------
async function askGemini(userMessage) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'INSERISCI_QUI_LA_TUA_API_KEY') {
        return 'API Key di Gemini non configurata. Apri il file script.js e inserisci la tua chiave.';
    }

    const systemPrompt = `Sei J.A.R.V.I.S., l'assistente personale intelligente ispirato a Iron Man.
Rispondi sempre in italiano, in modo cortese, preciso e un po' formale (usa "signore" quando appropriato).
Risposte brevi e chiare, ideali per essere lette ad alta voce (massimo 2-3 frasi).
Puoi aiutare con domande generali, curiosità, consigli, calcoli semplici, traduzioni, ecc.`;

    try {
        setStatus('speaking', 'Sto pensando...');
        setOrbState('speaking');

        const res = await fetch(GEMINI_URL, {
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
            console.error('Gemini error:', await res.text());
            return 'Mi dispiace, al momento non riesco a contattare i sistemi avanzati.';
        }

        const data = await res.json();
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

// ---------- Main command processor ----------
async function processCommand(command) {
    const cmd = command.toLowerCase().trim();
    let response = '';
    let handled = true;

    // ===== NOTE =====
    const notePatterns = [
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?|nota|crea\s+(?:una\s+)?nota)\s*[:\-]?\s*(.+)/i,
        /^(?:scrivi\s+(?:su\s+)?note?|scrivimi\s+(?:su\s+)?note?)\s+(.+)/i
    ];

    let noteContent = null;
    for (const pattern of notePatterns) {
        const match = command.match(pattern);
        if (match && match[1]) {
            noteContent = match[1].trim();
            break;
        }
    }

    if (!noteContent && /^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)/i.test(cmd)) {
        const parts = command.split(/:/);
        noteContent = parts.length > 1
            ? parts.slice(1).join(':').trim()
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

    // ===== LUCI =====
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

    // ===== TEMPERATURA =====
    else if (/(imposta|metti|porta a|imposta la temperatura).*(\d+)/.test(cmd) || /temperatura.*(a\s+)?(\d+)/.test(cmd)) {
        const match = cmd.match(/(\d{1,2})/);
        if (match) {
            const temp = parseInt(match[1]);
            if (temp >= 16 && temp <= 30) {
                home.temperatura = temp;
                response = `Temperatura impostata a ${temp} gradi.`;
            } else {
                response = 'Posso impostare la temperatura solo tra 16 e 30 gradi.';
            }
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

    // ===== TV =====
    else if (/(accendi|apri).*(tv|televisione|tele)/.test(cmd)) {
        home.tv = true;
        response = 'Televisione accesa.';
    }
    else if (/(spegni|chiudi).*(tv|televisione|tele)/.test(cmd)) {
        home.tv = false;
        response = 'Televisione spenta.';
    }

    // ===== MUSICA / VOLUME =====
    else if (/(metti|avvia|accendi|riproduci).*(musica|canzone|spotify|playlist)/.test(cmd)) {
        home.musica = true;
        response = 'Musica avviata.';
    }
    else if (/(ferma|stop|spegni|pausa).*(musica|canzone)/.test(cmd)) {
        home.musica = false;
        response = 'Musica fermata.';
    }
    else if (/(alza|aumenta).*(volume)/.test(cmd)) {
        home.volume = Math.min(100, home.volume + 10);
        response = `Volume impostato a ${home.volume}%.`;
    }
    else if (/(abbassa|diminuisci).*(volume)/.test(cmd)) {
        home.volume = Math.max(0, home.volume - 10);
        response = `Volume impostato a ${home.volume}%.`;
    }
    else if (/(volume a|imposta volume|volume al)\s*(\d+)/.test(cmd)) {
        const match = cmd.match(/(\d{1,3})/);
        if (match) {
            home.volume = Math.min(100, Math.max(0, parseInt(match[1])));
            response = `Volume impostato a ${home.volume}%.`;
        }
    }
    else if (/muto|silenzia|togli audio/.test(cmd)) {
        home.volume = 0;
        response = 'Audio disattivato.';
    }

    // ===== TIMER =====
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
        if (home.timer) {
            clearTimeout(home.timer);
            home.timer = null;
            response = 'Timer annullato.';
        } else {
            response = 'Non c\'è nessun timer attivo.';
        }
    }

    // ===== LISTA SPESA =====
    else if (/(aggiungi|metti).*(lista|spesa|shopping)\s+(.+)/.test(cmd) || /lista spesa\s*[:\-]\s*(.+)/.test(cmd)) {
        let item = cmd.replace(/(aggiungi|metti)\s+(alla\s+)?(lista|spesa|shopping)\s*/i, '')
                      .replace(/lista spesa\s*[:\-]\s*/i, '').trim();
        if (item) {
            home.listaSpesa.push(item);
            response = `Ho aggiunto "${item}" alla lista della spesa.`;
        }
    }
    else if (/(cosa c'è|mostrami|dimmi|leggi).*(lista|spesa)/.test(cmd) || /lista della spesa/.test(cmd)) {
        response = home.listaSpesa.length
            ? `Nella lista della spesa ci sono: ${home.listaSpesa.join(', ')}.`
            : 'La lista della spesa è vuota.';
    }
    else if (/(svuota|cancella|elimina).*(lista|spesa)/.test(cmd)) {
        home.listaSpesa = [];
        response = 'Lista della spesa svuotata.';
    }

    // ===== PROMEMORIA =====
    else if (/(ricordami|promemoria|ricorda).*(di\s+)?(.+)/.test(cmd)) {
        const match = command.match(/(?:ricordami|promemoria|ricorda)\s+(?:di\s+)?(.+)/i);
        if (match && match[1]) {
            const item = match[1].trim();
            home.promemoria.push(item);
            response = `Promemoria aggiunto: ${item}`;
        }
    }
    else if (/(quali sono i|mostrami i|dimmi i|leggi i).*(promemoria|ricordi)/.test(cmd)) {
        response = home.promemoria.length
            ? `I tuoi promemoria: ${home.promemoria.join('; ')}.`
            : 'Non hai promemoria salvati.';
    }

    // ===== ROUTINE =====
    else if (/(buongiorno|giornata|sveglia|routine mattina|modalità giorno)/.test(cmd) && !/(che ora|che giorno)/.test(cmd)) {
        setLight('tutte', false);
        setLight('soggiorno', true);
        setLight('cucina', true);
        home.temperatura = 21;
        response = 'Buongiorno. Ho acceso le luci del soggiorno e della cucina, e impostato la temperatura a 21 gradi. Buona giornata.';
    }
    else if (/(buonanotte|vanno a dormire|modalità notte|routine sera|spengi tutto)/.test(cmd)) {
        setLight('tutte', false);
        home.tv = false;
        home.musica = false;
        home.temperatura = 19;
        response = 'Buonanotte. Ho spento tutte le luci, la TV e la musica. Temperatura impostata a 19 gradi. Riposi bene.';
    }
    else if (/(cinema|film|modalità cinema)/.test(cmd)) {
        setLight('tutte', false);
        setLight('soggiorno', true);
        home.tv = true;
        home.volume = 30;
        response = 'Modalità cinema attivata. Luci abbassate, TV accesa e volume impostato.';
    }
    else if (/(esci|esco di casa|via di casa|modalità fuori)/.test(cmd)) {
        setLight('tutte', false);
        home.tv = false;
        home.musica = false;
        response = 'Modalità fuori casa attivata. Ho spento luci, TV e musica. Buona uscita.';
    }

    // ===== INFO BASE =====
    else if (/(ciao|salve|buongiorno|buonasera|ehi|hey)/.test(cmd) && !/(routine|modalità)/.test(cmd)) {
        const hour = new Date().getHours();
        if (hour < 12) response = 'Buongiorno, signore. Come posso assisterla oggi?';
        else if (hour < 18) response = 'Buon pomeriggio. Sono a sua disposizione.';
        else response = 'Buonasera. Pronto per qualsiasi richiesta.';
    }
    else if (/(che ora|che ore|ora attuale|dimmi l'ora|che ora è)/.test(cmd)) {
        const now = new Date();
        response = `Sono le ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}.`;
    }
    else if (/(che giorno|che data|data di oggi|che giorno è)/.test(cmd)) {
        const now = new Date();
        response = `Oggi è ${now.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
    }
    else if (/(come stai|come va|tutto bene)/.test(cmd)) {
        response = 'Tutti i sistemi funzionano a regime ottimale. Grazie per aver chiesto.';
    }
    else if (/(chi sei|presentati|cosa sei)/.test(cmd)) {
        response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System. Il suo assistente personale, ora potenziato con intelligenza artificiale.';
    }
    else if (/(grazie|ti ringrazio|thanks)/.test(cmd)) {
        response = 'Di nulla, signore. Sono qui per questo.';
    }
    else if (/(tony stark|iron man|stark)/.test(cmd)) {
        response = 'Il signor Stark non è disponibile al momento. Posso aiutarla io nel frattempo?';
    }
    else if (/(aiuto|cosa puoi fare|comandi|help|lista comandi)/.test(cmd)) {
        response = 'Posso gestire luci, temperatura, TV, musica, volume, timer, lista spesa, promemoria, note e routine. Inoltre ora posso rispondere a domande generali grazie all\'intelligenza artificiale. Provi pure a chiedermi qualsiasi cosa.';
    }

    // ===== FALLBACK → GEMINI =====
    else {
        handled = false;
        response = await askGemini(command);
    }

    if (handled) {
        reply(response);
    } else {
        addMessage(response, 'jarvis');
        speak(response);
    }
}

// ---------- Events ----------
micBtn.addEventListener('click', () => {
    if (!hasGreeted) {
        hasGreeted = true;
        const greeting = 'Sistema avviato. Pronto ad assisterti, signore.';
        addMessage(greeting, 'jarvis');
        speak(greeting);
        return;
    }

    if (isListening) {
        if (recognition) recognition.stop();
        stopListening();
    } else {
        startListening();
    }
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
