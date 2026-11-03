(function () {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const st = document.getElementById('st');
  const mic = document.getElementById('mic');
  const form = document.getElementById('f');
  const input = document.getElementById('in');

  const GEMINI = 'https://jarvis-gemini.gfurceri9.workers.dev';
  const TTS = 'https://frosty-waterfall-d1b0.gfurceri9.workers.dev/';
  const VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

  let listening = false;
  let recognition = null;
  let intensity = 1;
  let currentAudio = null;

  // ---------- Canvas neurale ----------
  let nodes = [];
  let links = [];

  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    build();
  }

  function build() {
    nodes = [];
    links = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const n = 95;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * Math.min(w, h) * 0.38;
      nodes.push({
        x: w / 2 + Math.cos(a) * r,
        y: h * 0.42 + Math.sin(a) * r * 0.9,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.55,
        r: 1.4 + Math.random() * 2.3,
        p: Math.random() * 6
      });
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (Math.hypot(dx, dy) < 135) links.push([i, j]);
      }
    }
  }

  function frame() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, Math.min(w, h) * 0.42);
    g.addColorStop(0, 'rgba(0,232,255,' + (0.14 * intensity) + ')');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const pair of links) {
      const a = nodes[pair[0]], b = nodes[pair[1]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 145) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = 'rgba(0,220,255,' + ((1 - d / 145) * 0.55 * intensity) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const n of nodes) {
      n.x += n.vx * intensity;
      n.y += n.vy * intensity;
      n.p += 0.05 * intensity;
      const cx = w / 2, cy = h * 0.42, maxR = Math.min(w, h) * 0.42;
      const dx = n.x - cx, dy = n.y - cy;
      if (Math.hypot(dx, dy) > maxR) {
        n.vx -= dx * 0.001;
        n.vy -= dy * 0.001;
      }
      const glow = 0.5 + Math.sin(n.p) * 0.4;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,232,255,' + (0.14 * glow * intensity) + ')';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(210,250,255,0.92)';
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  frame();
  window.addEventListener('resize', resize);

  function setSt(t) { st.textContent = t; }

  function stopAudio() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.src = ''; } catch (e) {}
      currentAudio = null;
    }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  function pickItalianVoice() {
    const voices = speechSynthesis.getVoices() || [];
    const prefer = [/luca/i, /diego/i, /google.*italiano/i, /microsoft.*it/i, /alice/i, /italiano/i, /^it[-_]/i];
    for (const re of prefer) {
      const v = voices.find(function (x) { return re.test(x.name) || re.test(x.lang); });
      if (v) return v;
    }
    return voices.find(function (x) { return x.lang && x.lang.toLowerCase().startsWith('it'); }) || null;
  }

  function speakBrowser(text) {
    return new Promise(function (resolve) {
      if (!window.speechSynthesis) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'it-IT';
      u.rate = 0.9;
      u.pitch = 0.75;
      u.volume = 1;
      const v = pickItalianVoice();
      if (v) u.voice = v;
      u.onend = resolve;
      u.onerror = resolve;
      setTimeout(function () { speechSynthesis.speak(u); }, 30);
    });
  }

  async function speakEleven(text) {
    const res = await fetch(TTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, voice_id: VOICE_ID })
    });
    if (!res.ok) {
      const errText = await res.text().catch(function () { return ''; });
      throw new Error('ElevenLabs HTTP ' + res.status + ' ' + errText.slice(0, 120));
    }
    const blob = await res.blob();
    if (!blob || blob.size < 400) throw new Error('Audio vuoto');

    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    currentAudio = audio;

    await new Promise(function (resolve, reject) {
      var done = false;
      function finish(err) {
        if (done) return;
        done = true;
        URL.revokeObjectURL(url);
        if (err) reject(err); else resolve();
      }
      audio.onended = function () { finish(); };
      audio.onerror = function () { finish(new Error('play error')); };
      var p = audio.play();
      if (p && p.catch) p.catch(function (e) { finish(e); });
    });
  }

  async function speak(text) {
    stopAudio();
    setSt('PARLANDO');
    intensity = 2.3;
    try {
      await speakEleven(text);
    } catch (e) {
      console.warn('ElevenLabs fallito, uso browser:', e);
      setSt('VOCE SYS');
      await speakBrowser(text);
    }
    intensity = 1;
    setSt('ONLINE');
    currentAudio = null;
  }

  // Solo voce, niente testo a schermo
  function say(text) {
    return speak(text);
  }

  async function askGemini(msg) {
    setSt('PENSO...');
    intensity = 2;
    try {
      const res = await fetch(GEMINI, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{
              text:
                'Sei J.A.R.V.I.S. Rispondi SEMPRE in italiano con frasi complete. ' +
                'Massimo 2 frasi brevi. Non troncare. Domanda: ' + msg
            }]
          }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 512 }
        })
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.error) {
        const code = (data.error && data.error.code) || res.status;
        if (code === 429) return 'Quota Gemini esaurita per oggi. Riprova domani.';
        if (code === 503) return 'Gemini e sovraccarico. Riprova tra poco.';
        return 'Sistemi AI non disponibili al momento.';
      }
      var t = '';
      try { t = data.candidates[0].content.parts[0].text || ''; } catch (e) {}
      t = String(t).trim();
      return t || 'Nessuna risposta ricevuta.';
    } catch (e) {
      return 'Errore di connessione AI.';
    } finally {
      intensity = 1;
      setSt('ONLINE');
    }
  }

  async function handle(raw) {
    const cmd = raw.toLowerCase().trim();
    if (!cmd) return;

    if (/^(ciao|salve|ehi|hey)\b/.test(cmd)) {
      const h = new Date().getHours();
      await say(h < 12 ? 'Buongiorno, signore.' : h < 18 ? 'Buon pomeriggio.' : 'Buonasera.');
      return;
    }
    if (/che ora/.test(cmd)) {
      await say('Sono le ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '.');
      return;
    }
    if (/chi sei|presentati/.test(cmd)) {
      await say('Sono J.A.R.V.I.S., Just A Rather Very Intelligent System.');
      return;
    }
    if (/accendi.*luci|luci.*accendi/.test(cmd)) {
      await say('Luci accese.');
      return;
    }
    if (/spegni.*luci|luci.*spegni/.test(cmd)) {
      await say('Luci spente.');
      return;
    }
    if (/grazie/.test(cmd)) {
      await say('Di nulla, signore.');
      return;
    }

    const answer = await askGemini(raw);
    await say(answer);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handle(text);
  });

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    recognition = new SR();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = function () {
      listening = true;
      mic.classList.add('on');
      setSt('ASCOLTO');
      intensity = 2;
    };
    recognition.onresult = function (e) {
      const t = e.results[0][0].transcript.trim();
      if (t) handle(t);
    };
    recognition.onerror = function () {
      listening = false;
      mic.classList.remove('on');
      setSt('ONLINE');
      intensity = 1;
    };
    recognition.onend = function () {
      listening = false;
      mic.classList.remove('on');
      setSt('ONLINE');
      intensity = 1;
    };
  }

  mic.addEventListener('click', function () {
    stopAudio();
    if (!recognition) {
      setSt('NO MIC');
      return;
    }
    if (listening) {
      recognition.stop();
      return;
    }
    try { recognition.start(); } catch (e) {}
  });

  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = function () { speechSynthesis.getVoices(); };
  }
})();
