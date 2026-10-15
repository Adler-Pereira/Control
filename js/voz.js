// Sala de voz/vídeo com compartilhamento de tela.
// WebRTC em malha (cada participante conecta direto com os outros) e o
// Supabase Realtime como "sinalização" (troca das ofertas/respostas).
// Funciona bem para grupos pequenos (até ~6 pessoas).
import { sb, esc } from './app.js';
import { ICE_SERVERS } from './config.js';

export class SalaVoz {
  constructor({ salaId, eu, nome, container, aoMudar }) {
    this.salaId = salaId;
    this.eu = eu;
    this.nome = nome;
    this.container = container;
    this.aoMudar = aoMudar || (() => {});
    this.peers = new Map();          // id -> { pc, polite, makingOffer, ignoreOffer, nome, el }
    this.local = null;               // MediaStream do microfone
    this.videoTrack = null;          // câmera ou tela
    this.modoVideo = null;           // 'camera' | 'tela' | null
    this.mudo = false;
    this.audioCtx = null;
  }

  async entrar() {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
    });
    this.#tile(this.eu, this.nome + ' (você)', this.local, true);

    this.canal = sb.channel(`voz:${this.salaId}`, { config: { presence: { key: this.eu }, broadcast: { self: false } } });
    this.canal
      .on('presence', { event: 'sync' }, () => this.#sincronizar())
      .on('broadcast', { event: 'sinal' }, ({ payload }) => { if (payload.para === this.eu) this.#sinal(payload); })
      .on('broadcast', { event: 'estado' }, ({ payload }) => this.#estadoRemoto(payload));
    await new Promise((ok, erro) => this.canal.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') { await this.canal.track({ nome: this.nome }); ok(); }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') erro(new Error('Não foi possível conectar à sala.'));
    }));
    this.aoMudar();
  }

  async sair() {
    for (const id of [...this.peers.keys()]) this.#remover(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.videoTrack?.stop();
    if (this.canal) { await this.canal.untrack(); await sb.removeChannel(this.canal); }
    this.audioCtx?.close();
    this.container.innerHTML = '';
    this.local = this.videoTrack = this.canal = null;
    this.modoVideo = null;
    this.aoMudar();
  }

  alternarMudo() {
    this.mudo = !this.mudo;
    this.local.getAudioTracks().forEach((t) => (t.enabled = !this.mudo));
    this.#enviarEstado();
    this.aoMudar();
  }

  async alternarCamera() {
    if (this.modoVideo === 'camera') return this.#pararVideo();
    const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    await this.#usarVideo(s.getVideoTracks()[0], 'camera');
  }

  async alternarTela() {
    if (this.modoVideo === 'tela') return this.#pararVideo();
    const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const track = s.getVideoTracks()[0];
    track.contentHint = 'detail';
    track.onended = () => { if (this.videoTrack === track) this.#pararVideo(); }; // usuário clicou em "parar" no navegador
    await this.#usarVideo(track, 'tela');
  }

  get participantes() { return this.peers.size + (this.local ? 1 : 0); }

  // ---------- internos ----------
  async #usarVideo(track, modo) {
    this.videoTrack?.stop();
    this.videoTrack = track;
    this.modoVideo = modo;
    for (const p of this.peers.values()) await p.videoSender.replaceTrack(track);
    this.#mostrarVideo(this.eu, new MediaStream([track]), modo === 'camera');
    this.#enviarEstado();
    this.aoMudar();
  }

  async #pararVideo() {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.modoVideo = null;
    for (const p of this.peers.values()) await p.videoSender.replaceTrack(null);
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
    p.el.querySelector('video.v').style.display = video ? 'block' : 'none';
    p.el.querySelector('.sem-video').style.display = video ? 'none' : 'block';
    p.el.querySelector('.nome').textContent = p.nome + (mudo ? ' 🔇' : '');
  }

  #sincronizar() {
    const estado = this.canal.presenceState();
    const presentes = new Set(Object.keys(estado));
    for (const id of presentes) {
      if (id !== this.eu && !this.peers.has(id)) this.#criarPeer(id, estado[id][0]?.nome || 'Jogador');
    }
    for (const id of [...this.peers.keys()]) if (!presentes.has(id)) this.#remover(id);
    this.aoMudar();
  }

  #criarPeer(id, nome) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const p = { pc, nome, polite: this.eu < id, makingOffer: false, ignoreOffer: false };
    this.peers.set(id, p);

    this.local.getAudioTracks().forEach((t) => pc.addTrack(t, this.local));
    p.videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    if (this.videoTrack) p.videoSender.replaceTrack(this.videoTrack);

    const remoto = new MediaStream();
    p.el = this.#tile(id, nome, remoto, false);
    pc.ontrack = ({ track }) => {
      remoto.addTrack(track);
      if (track.kind === 'audio') this.#detectarFala(remoto, p.el);
    };

    pc.onicecandidate = ({ candidate }) => candidate && this.#enviar(id, { candidate });
    pc.onnegotiationneeded = async () => {
      try {
        p.makingOffer = true;
        await pc.setLocalDescription();
        this.#enviar(id, { desc: pc.localDescription });
      } catch (e) { console.error(e); } finally { p.makingOffer = false; }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    setTimeout(() => this.#enviarEstado(), 1500);
  }

  // "Perfect negotiation" (padrão recomendado pelo W3C) para evitar colisões de oferta
  async #sinal({ de, desc, candidate }) {
    const p = this.peers.get(de);
    if (!p) return;
    const { pc } = p;
    try {
      if (desc) {
        const colisao = desc.type === 'offer' && (p.makingOffer || pc.signalingState !== 'stable');
        p.ignoreOffer = !p.polite && colisao;
        if (p.ignoreOffer) return;
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          this.#enviar(de, { desc: pc.localDescription });
        }
      } else if (candidate) {
        try { await pc.addIceCandidate(candidate); } catch (e) { if (!p.ignoreOffer) throw e; }
      }
    } catch (e) { console.error(e); }
  }

  #enviar(para, dados) {
    this.canal.send({ type: 'broadcast', event: 'sinal', payload: { de: this.eu, para, ...JSON.parse(JSON.stringify(dados)) } });
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
      ${local ? '' : '<audio autoplay></audio>'}
      <span class="nome">${esc(nome)}</span>`;
    if (!local) {
      el.querySelector('audio').srcObject = stream;
      el.querySelector('video.v').srcObject = stream;
    } else {
      this.#detectarFala(stream, el);
    }
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
    if (!stream.getAudioTracks().length) return;
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
