(function () {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas && canvas.getContext('2d', { alpha: true });
  const st = document.getElementById('st');
  const mic = document.getElementById('mic');
  const form = document.getElementById('f');
  const input = document.getElementById('in');
  const chat = document.querySelector('main');

  if (!canvas || !ctx || !st || !mic || !form || !input || !chat) return;

  const GEMINI = 'https://jarvis-gemini.gfurceri9.workers.dev';
  const TTS = 'https://frosty-waterfall-d1b0.gfurceri9.workers.dev/';
  const VOICE_ID = 'pNInz6obpgDQGcFmaJgB';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let listening = false;
  let recognition = null;
  let intensity = 1;
  let currentAudio = null;
  let currentAudioCleanup = null;
  let ttsController = null;
  let speechToken = 0;
  let frameId = 0;
  let nodes = [];
  let links = [];
  let lastFrame = 0;
  let frameCount = 0;
  let timerId = null;
  let requestId = 0;
  let geminiController = null;

  function showMessage(role, message) {
    const item = document.createElement('div');
    item.className = 'message ' + (role === 'user' ? 'user' : 'assistant');
    const label = document.createElement('span');
    label.className = 'message-label';
    label.textContent = role === 'user' ? 'TU' : 'JARVIS';
    const body = document.createElement('p');
    body.textContent = String(message || '');
    item.append(label, body);
    chat.appendChild(item);
    while (chat.children.length > 80) chat.removeChild(chat.firstChild);
    chat.scrollTop = chat.scrollHeight;
  }

  // ---------- Memoria personale locale ----------

  function readLocal(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) { return fallback; }
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  // ---------- Canvas: meno particelle, DPR limitato e animazione sospesa in background ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildNetwork(w, h);
    drawFrame();
  }

  function buildNetwork(w, h) {
    nodes = [];
    links = [];
    const count = Math.max(34, Math.min(58, Math.round((w * h) / 18000)));
    const centerX = w / 2;
    const centerY = h * 0.42;
    const radius = Math.min(w, h) * 0.37;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      nodes.push({
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance * 0.9,
        vx: (Math.random() - 0.5) * 0.32,
        vy: (Math.random() - 0.5) * 0.32,
        r: 1.2 + Math.random() * 1.8,
        phase: Math.random() * Math.PI * 2
      });
    }

    // I collegamenti vengono calcolati solo al resize, non a ogni frame.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (dx * dx + dy * dy < 145 * 145) links.push([i, j]);
      }
    }
  }

  function drawFrame() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2;
    const centerY = h * 0.42;
    const radius = Math.min(w, h) * 0.4;
    const glow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, radius);
    glow.addColorStop(0, 'rgba(0,232,255,' + (0.11 * intensity) + ')');
    glow.addColorStop(1, 'rgba(0,232,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;
    for (let i = 0; i < links.length; i++) {
      const a = nodes[links[i][0]];
      const b = nodes[links[i][1]];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 145) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(0,220,255,' + ((1 - distance / 145) * 0.38 * intensity) + ')';
      ctx.stroke();
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.x += n.vx * intensity;
      n.y += n.vy * intensity;
      n.phase += 0.035 * intensity;

      const dx = n.x - centerX;
      const dy = n.y - centerY;
      if (dx * dx + dy * dy > radius * radius) {
        n.vx -= dx * 0.0008;
        n.vy -= dy * 0.0008;
      }

      const pulse = 0.55 + Math.sin(n.phase) * 0.3;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,232,255,' + (0.1 * pulse * intensity) + ')';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210,250,255,0.9)';
      ctx.fill();
    }
  }

  function animate(timestamp) {
    if (document.hidden || reducedMotion) {
      frameId = 0;
      return;
    }
    // Limita il rendering a circa 30 FPS: l'effetto resta fluido ma pesa meno.
    if (timestamp - lastFrame >= 33) {
      drawFrame();
      lastFrame = timestamp;
    }
    frameId = requestAnimationFrame(animate);
  }

  function startAnimation() {
    if (!frameId && !document.hidden && !reducedMotion) {
      frameId = requestAnimationFrame(animate);
    }
  }

  function stopAnimation() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
  }

  resize();
  startAnimation();
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopAnimation();
    else startAnimation();
  });

  function setStatus(value) {
    st.textContent = value;
  }

  function stopAudio() {
    speechToken++;
    if (ttsController) {
      ttsController.abort();
      ttsController = null;
    }
    if (currentAudioCleanup) {
      currentAudioCleanup();
      currentAudioCleanup = null;
    }
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.removeAttribute('src');
        currentAudio.load();
      } catch (_) {}
      currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    intensity = 1;
  }

  function pickItalianVoice() {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const italian = voices.filter(function (voice) {
      return voice.lang && voice.lang.toLowerCase().startsWith('it');
    });
    const preferred = [/google.*ital/i, /microsoft.*ital/i, /luca/i, /diego/i, /alice/i];
    for (let i = 0; i < preferred.length; i++) {
      const match = italian.find(function (voice) { return preferred[i].test(voice.name); });
      if (match) return match;
    }
    return italian[0] || null;
  }

  function speakBrowser(text, token) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis || token !== speechToken) return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'it-IT';
      utterance.rate = 0.94;
      utterance.pitch = 0.9;
      utterance.volume = 1;
      const voice = pickItalianVoice();
      if (voice) utterance.voice = voice;

      let settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        utterance.onend = null;
        utterance.onerror = null;
        resolve();
      }
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function speakElevenChunk(text, token) {
    const controller = new AbortController();
    ttsController = controller;
    const timeout = window.setTimeout(function () { controller.abort(); }, 25000);

    try {
      const response = await fetch(TTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg, audio/*, application/octet-stream' },
        body: JSON.stringify({ text: text, voice_id: VOICE_ID }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(function () { return ''; });
        throw new Error('Worker TTS HTTP ' + response.status + (detail ? ': ' + detail.slice(0, 160) : ''));
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const detail = await response.text().catch(function () { return ''; });
        throw new Error('Il Worker non ha restituito audio: ' + detail.slice(0, 160));
      }

      const blob = await response.blob();
      if (!blob.size || token !== speechToken) throw new Error('Risposta audio vuota o superata da una nuova richiesta');

      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      audio.preload = 'auto';
      currentAudio = audio;

      await new Promise(function (resolve, reject) {
        let settled = false;
        function finish(error) {
          if (settled) return;
          settled = true;
          audio.onended = null;
          audio.onerror = null;
          audio.onabort = null;
          URL.revokeObjectURL(objectUrl);
          if (currentAudio === audio) currentAudio = null;
          if (currentAudioCleanup === cleanup) currentAudioCleanup = null;
          if (error) reject(error);
          else resolve();
        }
        function cleanup() {
          try { audio.pause(); } catch (_) {}
          finish();
        }
        currentAudioCleanup = cleanup;
        audio.onended = function () { finish(); };
        audio.onerror = function () { finish(new Error('Il browser non riesce a decodificare/riprodurre l’audio ricevuto')); };
        audio.onabort = function () { finish(); };

        audio.play().catch(function (error) { finish(error); });
      });
    } finally {
      window.clearTimeout(timeout);
      if (ttsController === controller) ttsController = null;
    }
  }


  // ElevenLabs accetta singole richieste limitate: dividi il testo in blocchi
  // più piccoli e riproducili in sequenza, senza perdere la risposta completa.
  function splitSpeechText(text, maxLength) {
    const chunks = [];
    let remaining = String(text || '').trim();
    while (remaining.length > maxLength) {
      let cut = remaining.lastIndexOf(' ', maxLength);
      if (cut < Math.floor(maxLength * 0.6)) cut = remaining.lastIndexOf('.', maxLength);
      if (cut < Math.floor(maxLength * 0.6)) cut = maxLength;
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }

  async function speakEleven(text, token) {
    const chunks = splitSpeechText(text, 4500);
    for (let i = 0; i < chunks.length; i++) {
      if (token !== speechToken) return;
      await speakElevenChunk(chunks[i], token);
    }
  }

  async function speakBrowserChunks(text, token) {
    const chunks = splitSpeechText(text, 1800);
    for (let i = 0; i < chunks.length; i++) {
      if (token !== speechToken) return;
      await speakBrowser(chunks[i], token);
    }
  }

  async function speak(text) {
    stopAudio();
    const token = speechToken;
    setStatus('PARLANDO');
    intensity = 1.8;

    try {
      await speakEleven(text, token);
    } catch (error) {
      if (token !== speechToken) return;
      console.warn('ElevenLabs non disponibile, fallback browser:', error);
      setStatus('VOCE SYS');
      await speakBrowserChunks(text, token);
    }

    if (token === speechToken) {
      intensity = 1;
      setStatus('ONLINE');
      currentAudio = null;
    }
  }

  async function askGemini(message, requestToken) {
    setStatus('PENSO...');
    intensity = 1.5;
    if (geminiController) geminiController.abort();
    const controller = new AbortController();
    geminiController = controller;
    const timeout = window.setTimeout(function () { controller.abort(); }, 45000);

    try {
      const response = await fetch(GEMINI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: 'Sei J.A.R.V.I.S. Rispondi in italiano, in modo diretto e naturale. Sii molto conciso: di norma 1-3 frasi e massimo circa 50 parole. Evita introduzioni, ripetizioni e dettagli non richiesti. Usa elenchi solo se servono o se vengono richiesti. Se la domanda richiede spiegazioni, dai solo i punti essenziali. Domanda: ' + message }]
          }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 512 }
        }),
        signal: controller.signal
      });
      const data = await response.json().catch(function () { return {}; });

      if (requestToken !== requestId) return '';
      if (!response.ok || data.error) {
        const code = data.error && data.error.code || response.status;
        if (code === 429) return 'Quota Gemini esaurita. Riprova più tardi.';
        if (code === 503) return 'Gemini è momentaneamente sovraccarico. Riprova tra poco.';
        if (code === 400) return 'La richiesta non è valida. Prova a riscriverla.';
        return 'Sistemi AI non disponibili al momento.';
      }

      const answer = data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map(function (part) { return part.text || ''; }).join('').trim()
        : '';
      if (!answer) return 'Nessuna risposta ricevuta.';

      return answer;
    } catch (error) {
      console.warn('Errore Gemini:', error);
      if (requestToken !== requestId) return '';
      return error && error.name === 'AbortError' ? 'La richiesta ha impiegato troppo tempo. Riprova.' : 'Errore di connessione AI. Controlla la rete e riprova.';
    } finally {
      window.clearTimeout(timeout);
      if (geminiController === controller) geminiController = null;
      intensity = 1;
    }
  }

  async function handle(raw) {
    const command = String(raw || '').trim();
    const normalized = command.toLowerCase();
    if (!normalized) return;

    const thisRequest = ++requestId;
    if (geminiController) geminiController.abort();
    stopAudio();
    showMessage('user', command);

    function reply(message) {
      if (thisRequest !== requestId) return;
      showMessage('assistant', message);
      speak(message);
    }

    const noteMatch = command.match(/^(?:scrivi|salva|aggiungi)\\s+(?:una\\s+)?nota\\s*[: ]\\s*(.+)$/i);
    if (noteMatch) {
      const content = noteMatch[1].trim();
      const notes = readLocal('jarvis_notes', []);
      notes.push({ text: content, date: new Date().toLocaleString('it-IT') });
      reply(writeLocal('jarvis_notes', notes) ? 'Nota salvata su questo dispositivo.' : 'Non riesco a salvare la nota.');
      return;
    }
    if (/^(?:leggi|mostra|quali sono le)\\s+note\\b/i.test(normalized)) {
      const notes = readLocal('jarvis_notes', []);
      reply(notes.length ? 'Le tue note: ' + notes.map((n, i) => (i + 1) + '. ' + n.text).join('. ') : 'Non hai ancora note salvate.');
      return;
    }
    if (/^(?:cancella|svuota)\\s+(?:tutte\\s+)?le note\\b/i.test(normalized)) {
      reply(writeLocal('jarvis_notes', []) ? 'Note cancellate da questo dispositivo.' : 'Non riesco ad aggiornare la memoria del browser.');
      return;
    }
    const shoppingMatch = command.match(/^(?:aggiungi|metti)\\s+(?:alla\\s+)?lista\\s+(?:della\\s+)?spesa\\s+(?:il\\s+|la\\s+|lo\\s+|i\\s+|le\\s+)?(.+)$/i);
    if (shoppingMatch) {
      const name = shoppingMatch[1].trim();
      const items = readLocal('jarvis_shopping', []);
      items.push(name);
      reply(writeLocal('jarvis_shopping', items) ? name + ' aggiunto alla lista sul dispositivo.' : 'Non riesco a salvare la lista sul dispositivo.');
      return;
    }
    if (/^(?:cosa c'è|leggi|mostra)\\s+(?:nella\\s+)?lista\\s+(?:della\\s+)?spesa\\b/i.test(normalized)) {
      const items = readLocal('jarvis_shopping', []);
      reply(items.length ? 'Lista della spesa: ' + items.join(', ') + '.' : 'La lista della spesa è vuota.');
      return;
    }
    if (/^(?:cancella|svuota)\\s+(?:la\\s+)?lista\\s+(?:della\\s+)?spesa\\b/i.test(normalized)) {
      reply(writeLocal('jarvis_shopping', []) ? 'Lista della spesa svuotata.' : 'Non riesco ad aggiornare la lista sul dispositivo.');
      return;
    }
    const timerMatch = normalized.match(/timer\s+(?:di\s+)?(\d+)\s*(secondi|secondo|minuti|minuto|ore|ora)\b/);
    if (timerMatch) {
      const amount = Number(timerMatch[1]);
      const unit = timerMatch[2];
      const multiplier = unit.startsWith('ora') ? 3600000 : unit.startsWith('min') ? 60000 : 1000;
      const duration = amount * multiplier;
      if (!Number.isSafeInteger(amount) || amount < 1 || duration > 86400000) { reply('Imposta un timer tra 1 secondo e 24 ore.'); return; }
      if (timerId !== null) clearTimeout(timerId);
      timerId = window.setTimeout(function () {
        timerId = null;
        showMessage('assistant', 'Timer terminato.');
        speak('Timer terminato.');
      }, duration);
      reply('Timer avviato per ' + amount + ' ' + unit + '.');
      return;
    }

    if (/^(ciao|salve|ehi|hey)\b/.test(normalized)) {
      const hour = new Date().getHours();
      reply(hour < 12 ? 'Buongiorno.' : hour < 18 ? 'Buon pomeriggio.' : 'Buonasera.');
      return;
    }
    if (/che ora/.test(normalized)) {
      reply('Sono le ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '.');
      return;
    }
    if (/chi sei|presentati/.test(normalized)) {
      reply('Sono J.A.R.V.I.S., Just A Rather Very Intelligent System.');
      return;
    }
    if (/accendi.*luci|luci.*accendi/.test(normalized)) {
      reply('Comando luci simulato: per controllarle davvero serve collegare un sistema domotico.');
      return;
    }
    if (/spegni.*luci|luci.*spegni/.test(normalized)) {
      reply('Comando luci simulato: per controllarle davvero serve collegare un sistema domotico.');
      return;
    }
    if (/grazie/.test(normalized)) {
      reply('Di nulla.');
      return;
    }

    const answer = await askGemini(command, thisRequest);
    if (answer && thisRequest === requestId) reply(answer);
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) return;
    input.value = '';
    handle(value);
    input.focus();
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = function () {
      listening = true;
      mic.classList.add('on');
      setStatus('ASCOLTO');
      intensity = 1.6;
    };
    recognition.onresult = function (event) {
      const transcript = event.results && event.results[0] && event.results[0][0]
        ? event.results[0][0].transcript.trim()
        : '';
      if (transcript) handle(transcript);
    };
    recognition.onerror = function (event) {
      console.warn('Riconoscimento vocale:', event.error);
      listening = false;
      mic.classList.remove('on');
      setStatus(event.error === 'not-allowed' ? 'MIC NEGATO' : event.error === 'no-speech' ? 'NESSUNA VOCE' : 'MIC ERRORE');
      intensity = 1;
    };
    recognition.onend = function () {
      listening = false;
      mic.classList.remove('on');
      if (st.textContent === 'ASCOLTO') setStatus('ONLINE');
      intensity = 1;
    };
  }

  mic.addEventListener('click', function () {
    stopAudio();
    if (!recognition) {
      setStatus('NO MIC');
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      console.warn('Microfono non avviabile:', error);
    }
  });

  if (window.speechSynthesis) window.speechSynthesis.getVoices();
})();
