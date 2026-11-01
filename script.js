// =====================
// JARVIS - Voice Interface
// Optimized for iPhone / Safari too
// =====================

const micBtn = document.getElementById('micBtn');
const holoCircle = document.getElementById('holoCircle');
const statusEl = document.getElementById('status');
const statusText = statusEl.querySelector('.status-text');
const listeningText = document.getElementById('listeningText');
const chatLog = document.getElementById('chatLog');
const textInput = document.getElementById('textInput');
const sendBtn = document.getElementById('sendBtn');

let isListening = false;
let isSpeaking = false;
let recognition = null;
let hasGreeted = false;

// ---------- Particles ----------
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

// ---------- Speech Synthesis (Jarvis parla) ----------
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

    if (italianVoice) {
        utterance.voice = italianVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        setStatus('speaking', 'Sta parlando...');
        holoCircle.classList.add('speaking');
        holoCircle.classList.remove('active');
    };

    utterance.onend = () => {
        isSpeaking = false;
        setStatus('idle', 'In attesa');
        holoCircle.classList.remove('speaking');
        listeningText.textContent = 'Tocca il microfono e parla';
    };

    utterance.onerror = () => {
        isSpeaking = false;
        setStatus('idle', 'In attesa');
        holoCircle.classList.remove('speaking');
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
        holoCircle.classList.add('active');
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
    holoCircle.classList.remove('active');
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
    // Accetta: "scrivi su note: ...", "scrivimi su note ...", "nota: ...", "scrivi una nota: ..."
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

    // Fallback: se inizia con "scrivi su note" anche senza due punti
    if (!noteContent && /^(scrivi\s+su\s+note|scrivimi\s+su\s+note|scrivi\s+una\s+nota)/i.test(cmd)) {
        const parts = command.split(/:/);
        if (parts.length > 1) {
            noteContent = parts.slice(1).join(':').trim();
        } else {
            // Prende tutto dopo le parole chiave
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
    // Prima interazione: saluta (necessario su iPhone)
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
        if (!hasGreeted) {
            hasGreeted = true;
        }
        addMessage(text, 'user');
        processCommand(text);
        textInput.value = '';
    }
});

textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendBtn.click();
    }
});

// Preload voices
if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
    };
}
