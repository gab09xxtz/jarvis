// =====================
// JARVIS - Voice Interface
// Particle Orb + Note feature
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

// ---------- Particle Orb ----------
const PARTICLE_COUNT = 900;
let particles = [];
let rotation = 0;
let rotationSpeed = 0.004; // idle speed
let targetSpeed = 0.004;
let pulse = 0;
let intensity = 1; // 1 = idle, higher when active

function initParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Fibonacci sphere distribution for even coverage
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

    // Soft outer glow
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius * 1.6);
    glow.addColorStop(0, `rgba(0, 240, 255, ${0.08 * intensity})`);
    glow.addColorStop(0.5, `rgba(0, 200, 255, ${0.04 * intensity})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Sort particles by depth (simple painter's algorithm)
    const projected = particles.map(p => {
        // Rotate around Y axis
        const cosY = Math.cos(rotation);
        const sinY = Math.sin(rotation);
        let x = p.x * cosY - p.z * sinY;
        let z = p.x * sinY + p.z * cosY;

        // Slight X tilt for more interesting movement
        const tilt = 0.35;
        const cosX = Math.cos(tilt);
        const sinX = Math.sin(tilt);
        let y = p.y * cosX - z * sinX;
        z = p.y * sinX + z * cosX;

        // Breathing / pulse effect
        const breathe = 1 + Math.sin(pulse + p.offset) * 0.04 * intensity;
        const scale = radius * breathe;

        const px = cx + x * scale;
        const py = cy + y * scale;
        const depth = (z + 1.2) / 2.2; // 0..1 roughly

        return { px, py, depth, size: p.baseSize, offset: p.offset };
    });

    projected.sort((a, b) => a.depth - b.depth);

    for (const p of projected) {
        const alpha = 0.25 + p.depth * 0.75;
        const size = p.size * (0.6 + p.depth * 0.9) * (0.9 + intensity * 0.15);

        // Color shifts slightly when active
        let r = 0, g = 220, b = 255;
        if (intensity > 1.3) {
            // greener when listening
            g = 255;
            b = 180;
        }
        if (intensity > 1.8) {
            // brighter cyan when speaking
            r = 0;
            g = 255;
            b = 230;
        }

        ctx.beginPath();
        ctx.arc(p.px, p.py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.9})`;
        ctx.fill();

        // Small bright core
        if (p.depth > 0.6) {
            ctx.beginPath();
            ctx.arc(p.px, p.py, size * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 255, 255, ${alpha * 0.7})`;
            ctx.fill();
        }
    }

    // Update animation state
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

// Init orb
initParticles();
drawOrb();

// ---------- Background floating particles ----------
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
    if (!window.speechSynthesis) {
        console.warn('Speech Synthesis non supportato');
        return;
    }

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

    recog.onend = () => {
        stopListening();
    };

    return recog;
}

recognition = initRecognition();

function startListening() {
    if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
    }
    if (recognition && !isListening) {
        try {
            recognition.start();
        } catch (e) {
            console.error(e);
        }
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

// ---------- Funzione Note (download) ----------
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

// ---------- Logica comandi ----------
function processCommand(command) {
    const cmd = command.toLowerCase().trim();
    let response = '';

    // === SCRIVI SU NOTE ===
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
        if (parts.length > 1) {
            noteContent = parts.slice(1).join(':').trim();
        } else {
            noteContent = command.replace(/^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)\s*/i, '').trim();
        }
    }

    if (noteContent && noteContent.length > 0) {
        try {
            const filename = createAndDownloadNote(noteContent);
            response = `Nota salvata e pronta per il download: ${filename}`;
        } catch (err) {
            console.error(err);
            response = 'Si è verificato un errore durante la creazione della nota.';
        }

        setTimeout(() => {
            addMessage(response, 'jarvis');
            speak(response);
        }, 300);
        return;
    }

    // === Altri comandi base ===
    if (/(ciao|salve|buongiorno|buonasera|ehi|hey)/.test(cmd)) {
        const hour = new Date().getHours();
        if (hour < 12) response = 'Buongiorno, signore. Come posso assisterla oggi?';
        else if (hour < 18) response = 'Buon pomeriggio. Sono a sua disposizione.';
        else response = 'Buonasera. Pronto per qualsiasi richiesta.';
    }
    else if (/(che ora|che ore|ora attuale|dimmi l'ora|che ora è)/.test(cmd)) {
        const now = new Date();
        const time = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        response = `Sono le ${time}.`;
    }
    else if (/(che giorno|che data|data di oggi|che giorno è)/.test(cmd)) {
        const now = new Date();
        const date = now.toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        response = `Oggi è ${date}.`;
    }
    else if (/(come stai|come va|tutto bene)/.test(cmd)) {
        response = 'Tutti i sistemi funzionano a regime ottimale. Grazie per aver chiesto.';
    }
    else if (/(chi sei|presentati|cosa sei)/.test(cmd)) {
        response = 'Sono J.A.R.V.I.S., Just A Rather Very Intelligent System. Il suo assistente personale.';
    }
    else if (/(grazie|ti ringrazio|thanks)/.test(cmd)) {
        response = 'Di nulla, signore. Sono qui per questo.';
    }
    else if (/(aiuto|cosa puoi fare|comandi|help)/.test(cmd)) {
        response = 'Posso dirti l\'ora e la data, risponderti ai saluti e creare note. Per salvare una nota di\': "scrivi su note: il testo che vuoi". La nota verrà scaricata automaticamente.';
    }
    else if (/(tony stark|iron man|stark)/.test(cmd)) {
        response = 'Il signor Stark non è disponibile al momento. Posso aiutarla io nel frattempo?';
    }
    else {
        response = 'Ho ricevuto il suo messaggio. Sto ancora imparando. Presto potrò fare molto di più.';
    }

    setTimeout(() => {
        addMessage(response, 'jarvis');
        speak(response);
    }, 300);
}

// ---------- Eventi ----------
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

// Preload voices
if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}
