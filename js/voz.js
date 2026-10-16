// Sala de voz/vídeo com compartilhamento de tela e chat de texto.
// WebRTC em malha (cada participante conecta direto com os outros) e o
// Supabase Realtime como "sinalização" (troca das ofertas/respostas).
// Funciona bem para grupos pequenos (até ~6 pessoas).
import { sb, esc } from './app.js';
import { ICE_SERVERS } from './config.js';

// Servidores STUN/TURN: pede credenciais temporárias de TURN ao servidor (se configurado).
// Sem TURN, redes de celular/CGNAT muitas vezes não deixam os navegadores se conectarem.
let iceCache = null;
async function servidoresIce() {
  if (iceCache && iceCache.expira > Date.now()) return iceCache;
  try {
    const r = await fetch('/.netlify/functions/turn');
    if (r.ok) {
      const d = await r.json();
      if (d.iceServers?.length) {
        // Primeiro só os TURN próprios (Oracle, IPv6 de casa); a Cloudflare entra como reserva se não conectar
        const completa = [...ICE_SERVERS, ...d.iceServers];
        const inicial = d.primarios?.length && d.reserva?.length ? [...ICE_SERVERS, ...d.primarios] : completa;
        return (iceCache = { lista: inicial, completa, turn: true, expira: Date.now() + 3600e3 });
      }
    }
  } catch { /* sem função: só STUN */ }
  return (iceCache = { lista: ICE_SERVERS, completa: ICE_SERVERS, turn: false, expira: Date.now() + 600e3 });
}

// Preferências de áudio (salvas no aparelho): microfone, supressão de ruído, cancelamento de eco, ganho automático
export function prefsAudio() {
  try { return { ruido: true, eco: true, ganho: true, ...JSON.parse(localStorage.getItem('cc_audio') || '{}') }; } catch { return { ruido: true, eco: true, ganho: true }; }
}
const restricoesMic = (o) => ({
  deviceId: o.mic ? { ideal: o.mic } : undefined,
  noiseSuppression: o.ruido, echoCancellation: o.eco, autoGainControl: o.ganho,
  voiceIsolation: o.ruido, // isolamento de voz (Chrome/Safari recentes): corta teclado, ventilador e vozes ao fundo
});

const ESTADOS = { new: 'conectando…', connecting: 'conectando…', connected: '', disconnected: 'reconectando…', failed: 'sem conexão', closed: '' };

export class SalaVoz {
  constructor({ salaId, eu, nome, container, aoMudar, aoChat, aoAviso }) {
    this.salaId = salaId;
    this.eu = eu;
    this.nome = nome;
    this.container = container;
    this.aoMudar = aoMudar || (() => {});
    this.aoChat = aoChat || (() => {});
    this.aoAviso = aoAviso || (() => {});
    this.peers = new Map();          // id -> { pc, polite, makingOffer, ignoreOffer, nome, el, pendentes }
    this.local = null;               // MediaStream do microfone
    this.videoTrack = null;          // câmera ou tela
    this.modoVideo = null;           // 'camera' | 'tela' | null
    this.mudo = false;
    this.audioCtx = null;
  }

  async entrar() {
    this.local = await navigator.mediaDevices.getUserMedia({ audio: restricoesMic(prefsAudio()), video: false });
    this.ice = await servidoresIce();
    this.#tile(this.eu, this.nome + ' (você)', this.local, true);

    this.canal = sb.channel(`voz:${this.salaId}`, { config: { presence: { key: this.eu }, broadcast: { self: false } } });
    this.canal
      .on('presence', { event: 'sync' }, () => this.#sincronizar())
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { if (payload.para === this.eu) this.#sinal(payload); })
      .on('broadcast', { event: 'estado' }, ({ payload }) => this.#estadoRemoto(payload))
      .on('broadcast', { event: 'chat' }, ({ payload }) => this.aoChat(payload));
    await new Promise((ok, erro) => this.canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { await this.canal.track({ nome: this.nome }); ok(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') erro(new Error('Não foi possível conectar à sala.'));
    }));
    this.vigia = setInterval(() => this.#vigiar(), 4000);
    this.aoMudar();
  }

  // Mensagens de sinalização podem se perder (limite de mensagens do Realtime).
  // A cada 4 s, pares que não avançaram recebem a oferta de novo.
  async #vigiar() {
    for (const [id, p] of this.peers) {
      const { pc } = p;
      if (pc.connectionState === 'connected' || Date.now() - p.criado < 5000) continue;
      // Não conectou só com os servidores próprios: acrescenta a reserva (Cloudflare) e refaz a busca de caminho
      if (!p.comReserva && this.ice.completa.length > this.ice.lista.length) {
        p.comReserva = true;
        try { pc.setConfiguration({ ...pc.getConfiguration(), iceServers: this.ice.completa }); if (!p.polite && pc.remoteDescription) pc.restartIce(); } catch (e) { console.warn(e); }
        continue;
      }
      try {
        if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
          this.#enviar(id, { desc: pc.localDescription });              // a oferta pode ter se perdido
        } else if (pc.signalingState === 'stable' && !pc.remoteDescription && !p.polite) {
          p.makingOffer = true;                                          // ninguém começou: o lado "impolite" puxa
          await pc.setLocalDescription();
          this.#enviar(id, { desc: pc.localDescription });
          p.makingOffer = false;
        } else if (pc.signalingState === 'stable' && pc.remoteDescription && ['new', 'failed', 'disconnected'].includes(pc.iceConnectionState) && !p.polite) {
          pc.restartIce();                                               // negociou mas não achou caminho
        }
      } catch (e) { p.makingOffer = false; console.warn(e); }
    }
  }

  async sair() {
    clearInterval(this.vigia);
    for (const id of [...this.peers.keys()]) this.#remover(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.videoTrack?.stop();
    this.audioTela?.stop();
    if (this.canal) { await this.canal.untrack().catch(() => {}); await sb.removeChannel(this.canal); }
    this.audioCtx?.close();
    this.container.innerHTML = '';
    this.local = this.videoTrack = this.canal = null;
    this.modoVideo = null;
    this.aoMudar();
  }

  enviarChat(texto) {
    const msg = { de: this.eu, nome: this.nome, texto: String(texto).slice(0, 500), em: Date.now() };
    this.canal?.send({ type: 'broadcast', event: 'chat', payload: msg });
    this.aoChat(msg);
  }

  // Alguns navegadores (principalmente no celular) bloqueiam áudio automático: tenta tocar de novo
  async ativarSom() {
    await this.audioCtx?.resume().catch(() => {});
    for (const p of this.peers.values()) for (const a of p.el.querySelectorAll('audio')) await a.play().catch(() => {});
  }

  alternarMudo() {
    this.mudo = !this.mudo;
    this.local.getAudioTracks().forEach((t) => (t.enabled = !this.mudo));
    this.#enviarEstado();
    this.aoMudar();
  }

  // Troca microfone/filtros sem sair da call
  async configurarAudio(o) {
    try { localStorage.setItem('cc_audio', JSON.stringify(o)); } catch { /* ignora */ }
    if (!this.local) return;
    const t = (await navigator.mediaDevices.getUserMedia({ audio: restricoesMic(o) })).getAudioTracks()[0];
    t.enabled = !this.mudo;
    for (const p of this.peers.values()) await p.micSender?.replaceTrack(t);
    const velho = this.local.getAudioTracks()[0];
    this.local.removeTrack(velho); velho.stop(); this.local.addTrack(t);
  }

  async alternarCamera() {
    if (this.modoVideo === 'camera') return this.#pararVideo();
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.#usarVideo(s.getVideoTracks()[0], 'camera');
  }

  // opcoes: { altura: 720|1080, fps: 30|60, som: boolean, movimento: boolean (jogo) ou false (texto/código) }
  async alternarTela(opcoes = {}) {
    if (this.modoVideo === 'tela') return this.#pararVideo();
    const { altura = 1080, fps = 30, som = true, movimento = true } = opcoes;
    const s = await navigator.mediaDevices.getDisplayMedia({
      video: { height: { ideal: altura }, frameRate: { ideal: fps, max: fps } },
      // suppressLocalAudioPlayback: não toca o som da aba para você (evita eco); restrictOwnAudio: não captura o som do próprio site (vozes da call)
      audio: som ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false, restrictOwnAudio: true } : false,
      systemAudio: som ? 'include' : 'exclude', selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
      windowAudio: som ? 'window' : 'exclude',
    });
    const track = s.getVideoTracks()[0];
    track.contentHint = movimento ? 'motion' : 'detail';
    track.onended = () => { if (this.videoTrack === track) this.#pararVideo(); }; // usuário clicou em "parar" no navegador
    this.audioTela?.stop();
    this.audioTela = s.getAudioTracks()[0] || null;                      // som do jogo/aba (quando o navegador permite)
    for (const p of this.peers.values()) await p.audioTelaSender.replaceTrack(this.audioTela);
    this.qualidade = { altura, fps, movimento };
    await this.#usarVideo(track, 'tela');
    return { comSom: !!this.audioTela };
  }

  // Ajusta a taxa de envio: tela com mais bits (nitidez) e preferência por fluidez (jogo) ou resolução (texto)
  async #configurarEnvio(sender) {
    try {
      const prm = sender.getParameters();
      prm.encodings = prm.encodings?.length ? prm.encodings : [{}];
      const tela = this.modoVideo === 'tela';
      prm.encodings[0].maxBitrate = tela ? (this.qualidade?.altura >= 1080 ? 4_000_000 : 2_500_000) : 1_200_000;
      prm.encodings[0].maxFramerate = tela ? this.qualidade?.fps || 30 : 30;
      prm.degradationPreference = tela && !this.qualidade?.movimento ? 'maintain-resolution' : 'balanced';
      await sender.setParameters(prm);
    } catch { /* navegador sem suporte: usa o padrão */ }
  }

  get participantes() { return this.peers.size + (this.local ? 1 : 0); }
  get conectados() { return [...this.peers.values()].filter((p) => p.pc.connectionState === 'connected').length; }

  // ---------- internos ----------
  async #usarVideo(track, modo) {
    this.videoTrack?.stop();
    this.videoTrack = track;
    this.modoVideo = modo;
    for (const p of this.peers.values()) { await p.videoSender.replaceTrack(track); this.#configurarEnvio(p.videoSender); }
    this.#mostrarVideo(this.eu, new MediaStream([track]), modo === 'camera');
    this.#enviarEstado();
    this.aoMudar();
  }

  async #pararVideo() {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.modoVideo = null;
    this.audioTela?.stop(); this.audioTela = null;
    for (const p of this.peers.values()) { await p.videoSender.replaceTrack(null); await p.audioTelaSender.replaceTrack(null); }
    this.#mostrarVideo(this.eu, null);
    this.#enviarEstado();
    this.aoMudar();
  }

  #enviarEstado() {
    this.canal?.send({ type: 'broadcast', event: 'estado', payload: { de: this.eu, video: !!this.videoTrack, mudo: this.mudo } });
  }

  #estadoRemoto({ de, video, mudo }) {
    const p = this.peers.get(de);
    if (!p) return;
    p.mudo = mudo;
    if (video === false) this.#videoRemoto(p, false);
    this.#atualizarNome(p);
  }

  #atualizarNome(p) {
    const st = ESTADOS[p.pc.connectionState] ?? '';
    p.el.querySelector('.nome').textContent = p.nome + (p.mudo ? ' 🔇' : '') + (st ? ` · ${st}` : '');
    p.el.classList.toggle('sem-conexao', p.pc.connectionState === 'failed');
  }

  #videoRemoto(p, ligado) {
    p.el.querySelector('video.v').style.display = ligado ? 'block' : 'none';
    p.el.querySelector('.sem-video').style.display = ligado ? 'none' : 'block';
  }

  #sincronizar() {
    const estado = this.canal.presenceState();
    const presentes = new Set(Object.keys(estado));
    for (const id of presentes) {
      if (id === this.eu) continue;
      if (!this.peers.has(id)) this.#criarPeer(id, estado[id][0]?.nome || 'Jogador');
      this.peers.get(id).visto = true;
    }
    // Só remove quem já apareceu na lista e saiu. Conexões abertas por um convite que chegou
    // antes da lista atualizar ganham 15 s de tolerância.
    for (const [id, p] of [...this.peers]) {
      if (!presentes.has(id) && (p.visto || Date.now() - p.criado > 15000)) this.#remover(id);
    }
    this.aoMudar();
  }

  #criarPeer(id, nome) {
    const pc = new RTCPeerConnection({ iceServers: this.ice.lista });
    const p = { pc, nome, polite: this.eu < id, makingOffer: false, ignoreOffer: false, pendentes: [], mudo: false, criado: Date.now(), visto: false };
    this.peers.set(id, p);

    p.micSender = pc.addTrack(this.local.getAudioTracks()[0], this.local);
    p.videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    p.audioTelaSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;   // som da tela compartilhada
    if (this.videoTrack) { p.videoSender.replaceTrack(this.videoTrack); this.#configurarEnvio(p.videoSender); }
    if (this.audioTela) p.audioTelaSender.replaceTrack(this.audioTela);

    const remoto = new MediaStream();
    p.el = this.#tile(id, nome, remoto, false);
    pc.ontrack = ({ track }) => {
      remoto.addTrack(track);
      if (track.kind === 'audio') {
        // 2ª trilha de áudio = som da tela compartilhada: toca num elemento próprio
        if (remoto.getAudioTracks().length > 1) {
          const a = document.createElement('audio');
          a.autoplay = true; a.srcObject = new MediaStream([track]); a.className = 'som-tela';
          p.el.append(a); a.play().catch(() => this.aoAviso('som-bloqueado'));
          return;
        }
        this.#detectarFala(remoto, p.el);
        const voz = p.el.querySelector('audio');
        voz.srcObject = new MediaStream([track]);           // só a voz (o som da tela toca em outro elemento)
        voz.play().catch(() => this.aoAviso('som-bloqueado'));
      } else {
        // o vídeo aparece quando os quadros começam a chegar (tela ou câmera ligada)
        track.onunmute = () => this.#videoRemoto(p, true);
        track.onmute = () => this.#videoRemoto(p, false);
      }
    };

    // Candidatos ICE vão em lote (menos mensagens = menos risco de bater no limite do Realtime)
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      (p.lote ||= []).push(candidate.toJSON());
      clearTimeout(p.timerLote);
      p.timerLote = setTimeout(() => { const c = p.lote.splice(0); if (c.length) this.#enviar(id, { candidates: c }); }, 150);
    };
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.#enviar(id, { desc: pc.localDescription });
      } catch (e) { console.error(e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      this.#atualizarNome(p);
      if (pc.connectionState === 'failed') {
        pc.restartIce();
        if (!this.ice.turn) this.aoAviso('sem-turn');
      }
      this.aoMudar();
    };
    setTimeout(() => this.#enviarEstado(), 1500);
    // Não conectou em 20 s? Provavelmente a rede bloqueou a conexão direta.
    setTimeout(() => { if (this.peers.get(id) === p && pc.connectionState !== 'connected') this.aoAviso(this.ice.turn ? 'lento' : 'sem-turn'); }, 20000);
    return p;
  }

  // "Perfect negotiation" (padrão recomendado pelo W3C) para evitar colisões de oferta
  async #sinal({ de, nome, desc, candidate, candidates }) {
    if (candidates) { for (const c of candidates) await this.#sinal({ de, nome, candidate: c }); return; }
    // A oferta pode chegar antes de a lista de presença atualizar: cria a conexão na hora
    // (antes ela era descartada e as pessoas se viam na lista, mas sem áudio/vídeo).
    let p = this.peers.get(de);
    if (!p) {
      if (!this.local) return;
      p = this.#criarPeer(de, nome || this.canal.presenceState()[de]?.[0]?.nome || 'Jogador');
    }
    const { pc } = p;
    try {
      if (desc) {
        const colisao = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && colisao;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        // candidatos que chegaram antes da descrição
        for (const c of p.pendentes.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          this.#enviar(de, { desc: pc.localDescription });
        }
      } else if (candidate) {
        if (!pc.remoteDescription) { p.pendentes.push(candidate); return; }
        try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffer) console.warn(e); }
      }
    } catch (e) { console.error(e); }
  }

  #enviar(para, dados) {
    this.canal.send({ type: 'broadcast', event: 'sinal', payload: { de: this.eu, nome: this.nome, para, ...JSON.parse(JSON.stringify(dados)) } });
  }

  #remover(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.el.remove();
    this.peers.delete(id);
  }

  #tile(id, nome, stream, local) {
    const el = document.createElement('div');
    el.className = 'participante';
    el.dataset.id = id;
    el.innerHTML = `<span class="sem-video">${esc(nome.trim()[0]?.toUpperCase() || '?')}</span>
      <video class="v" autoplay playsinline muted style="display:none"></video>
      ${local ? '' : '<audio autoplay playsinline></audio>'}
      <span class="nome">${esc(nome)}${local ? '' : ' · conectando…'}</span>
      <span class="acoes-video">
        <button class="pip" title="Janela flutuante (assistir enquanto joga)" aria-label="Janela flutuante">⧉</button>
        <button class="tela-cheia" title="Tela cheia" aria-label="Tela cheia">⛶</button>
      </span>`;
    if (!local) {
      el.querySelector('video.v').srcObject = stream;
    } else {
      this.#detectarFala(stream, el);
    }
    el.querySelector('.pip').onclick = async (e) => {
      e.stopPropagation();
      const v = el.querySelector('video.v');
      try {
        if (document.pictureInPictureElement === v) await document.exitPictureInPicture();
        else if (v.style.display !== 'none' && v.requestPictureInPicture) await v.requestPictureInPicture();
        else this.aoAviso('sem-video');
      } catch { this.aoAviso('sem-pip'); }
    };
    el.querySelector('.tela-cheia').onclick = (e) => {
      e.stopPropagation();
      const v = el.querySelector('video.v');
      (document.fullscreenElement ? document.exitFullscreen() : (v.style.display !== 'none' ? v : el).requestFullscreen?.())?.catch?.(() => {});
    };
    this.container.append(el);
    return el;
  }

  #mostrarVideo(id, stream, espelhar = false) {
    const el = this.container.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    const v = el.querySelector('video.v');
    v.srcObject = stream;
    v.style.display = stream ? 'block' : 'none';
    v.style.transform = espelhar ? 'scaleX(-1)' : '';
    el.querySelector('.sem-video').style.display = stream ? 'none' : 'block';
  }

  #detectarFala(stream, el) {
    if (!stream.getAudioTracks().length || el.dataset.analisando) return;
    el.dataset.analisando = '1';
    this.audioCtx ||= new AudioContext();
    const an = this.audioCtx.createAnalyser();
    an.fftSize = 512;
    this.audioCtx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const loop = () => {
      if (!el.isConnected) return;
      an.getByteFrequencyData(buf);
      const media = buf.reduce((a, b) => a + b, 0) / buf.length;
      el.classList.toggle('falando', media > 18);
      requestAnimationFrame(loop);
    };
    loop();
  }
}
