// Interface da call (usada nas comunidades e na call entre amigos)
import { $, esc, falha, toast } from './app.js';
import { SalaVoz, prefsAudio } from './voz.js';

export function montarCall(box, { salaId, u, p, descricao = '', titulo = 'Call', janela = false }) {
  box.innerHTML = `
    ${descricao ? `<p class="muted">${descricao}</p>` : ''}
    <div class="controles" style="margin:12px 0">
      <button class="btn" data-v="entrar">🔊 Entrar na call</button>
      <button class="btn sec hidden" data-v="mudo">🎤 Silenciar</button>
      <button class="btn sec hidden" data-v="cam">📷 Câmera</button>
      <button class="btn sec hidden" data-v="tela">🖥️ Compartilhar tela</button>
      <button class="btn sec hidden" data-v="som">🔈 Ativar som</button>
      <button class="btn sec" data-v="cfg-audio" title="Microfone, supressão de ruído e eco">⚙️ Áudio</button>
      ${janela ? '' : '<button class="btn sec" data-v="popout" title="Abre a call numa janela separada: você continua navegando pelo site sem cair">🗗 Abrir em janela</button>'}
      <button class="btn perigo hidden" data-v="sair">Sair da call</button>
    </div>
    <div class="opcoes-tela cartao hidden" data-v="audio">
      <strong>Áudio</strong>
      <label>Microfone <select data-v="a-mic"><option value="">Padrão do sistema</option></select></label>
      ${[['ruido', '🎧 Supressão de ruído e isolamento de voz (remove teclado, ventilador e sons de fundo)'], ['eco', '🔁 Cancelamento de eco (use se estiver sem fone)'], ['ganho', '📶 Ajuste automático de volume do microfone']]
        .map(([k, t]) => `<label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-a="${k}" style="width:auto"> ${t}</label>`).join('')}
      <p class="muted" style="font-size:.82rem;margin-top:6px">💡 Para não duplicar vozes: não fique na call do site e na do Discord ao mesmo tempo, e ao compartilhar a tela com som prefira uma <strong>aba</strong> ou a <strong>janela do jogo</strong> (a tela inteira captura também o som do Discord).</p>
      <div class="controles" style="margin-top:8px"><button class="btn pequeno" data-v="a-ok">Aplicar</button><button class="btn sec pequeno" data-v="a-fechar">Fechar</button></div>
    </div>
    <div class="opcoes-tela cartao hidden" data-v="opcoes">
      <strong>Compartilhar tela</strong>
      <div class="form-linha" style="margin-top:8px">
        <label>Tipo <select data-v="o-tipo"><option value="jogo">🎮 Jogo / vídeo (mais fluido)</option><option value="texto">📄 Texto / código (mais nítido)</option></select></label>
        <label>Qualidade <select data-v="o-alt"><option value="720">720p</option><option value="1080" selected>1080p</option></select></label>
        <label>Quadros <select data-v="o-fps"><option value="30">30 fps</option><option value="60">60 fps</option></select></label>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" data-v="o-som" checked style="width:auto"> Incluir o som (jogo/aba). No Chrome do Windows funciona com a tela inteira ou uma aba; em janelas avulsas o navegador não permite.</label>
      <div class="controles" style="margin-top:8px"><button class="btn pequeno" data-v="o-ok">Escolher o que compartilhar</button><button class="btn sec pequeno" data-v="o-cancelar">Cancelar</button></div>
    </div>
    <div class="controles" style="align-items:center;justify-content:space-between">
      <p class="muted" data-v="info"></p>
      <span class="controles hidden" data-v="layout"><button class="chip ativo" data-l="grade">▦ Grade</button><button class="chip" data-l="destaque">⬛ Destaque</button>
        <span class="muted" style="font-size:.8rem">Clique nos vídeos para fixar (até 4 lado a lado)</span></span>
    </div>
    <div class="aviso hidden" data-v="aviso"></div>
    <div class="call-layout">
      <div class="sala" data-v="sala"></div>
      <aside class="call-chat hidden" data-v="chat">
        <div class="call-msgs" data-v="msgs"><p class="muted" style="font-size:.85rem">Chat da call: as mensagens não ficam salvas.</p></div>
        <form data-v="form-chat" class="controles"><input data-v="txt" maxlength="500" placeholder="Mensagem..." autocomplete="off" style="flex:1"><button class="btn pequeno">Enviar</button></form>
      </aside>
    </div>`;
  const el = (k) => box.querySelector(`[data-v="${k}"]`);
  let sala = null;

  const atualizar = () => {
    const dentro = !!sala?.local;
    el('entrar').classList.toggle('hidden', dentro);
    ['mudo', 'cam', 'tela', 'sair', 'layout'].forEach((k) => el(k).classList.toggle('hidden', !dentro));
    el('chat').classList.toggle('hidden', !dentro);
    if (!dentro) { el('info').textContent = ''; el('aviso').classList.add('hidden'); el('som').classList.add('hidden'); el('opcoes').classList.add('hidden'); return; }
    el('mudo').textContent = sala.mudo ? '🔇 Ativar microfone' : '🎤 Silenciar';
    el('cam').classList.toggle('ligado', sala.modoVideo === 'camera');
    el('tela').classList.toggle('ligado', sala.modoVideo === 'tela');
    el('tela').textContent = sala.modoVideo === 'tela' ? '🖥️ Parar compartilhamento' : '🖥️ Compartilhar tela';
    const outros = sala.participantes - 1;
    el('info').textContent = outros ? `${sala.participantes} pessoas na call · ${sala.conectados} de ${outros} conectada(s)` : 'Você está na call. Aguardando outras pessoas...';
  };
  const avisar = (tipo) => {
    if (tipo === 'som-bloqueado') { el('som').classList.remove('hidden'); toast('O navegador bloqueou o som. Clique em "Ativar som".', true); return; }
    const msgs = {
      'sem-turn': '⚠️ Não foi possível conectar com alguém da call. Isso costuma acontecer em redes de celular ou de provedores que bloqueiam conexão direta. O administrador do site pode ativar o servidor de retransmissão (TURN) — veja o README.',
      lento: '⏳ A conexão com alguém está demorando. Se não conectar, saiam e entrem de novo na call.',
      'sem-video': 'Essa pessoa não está com câmera ou tela ligada.',
      'sem-pip': 'Seu navegador não permite janela flutuante para este vídeo.',
    };
    el('aviso').textContent = msgs[tipo] || '';
    el('aviso').classList.toggle('hidden', !msgs[tipo]);
  };
  const mostrarMsg = (m) => {
    const d = document.createElement('p');
    d.innerHTML = `<strong>${esc(m.nome)}:</strong> ${esc(m.texto)}`;
    el('msgs').append(d); el('msgs').scrollTop = el('msgs').scrollHeight;
  };
  if (!navigator.mediaDevices?.getDisplayMedia) { el('tela').disabled = true; el('tela').title = 'Seu navegador (geralmente celular) não permite compartilhar a tela'; }

  el('entrar').onclick = async () => {
    el('entrar').disabled = true;
    sala = new SalaVoz({ salaId, eu: u.id, nome: p.username, container: el('sala'), aoMudar: atualizar, aoChat: mostrarMsg, aoAviso: avisar });
    try { await sala.entrar(); } catch (e) {
      sala = null;
      falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso ao microfone para entrar na call (ícone de cadeado na barra de endereço).' }
        : e.name === 'NotFoundError' ? { message: 'Nenhum microfone encontrado neste aparelho.' } : e);
    } finally { el('entrar').disabled = false; }
  };
  el('sair').onclick = () => sala.sair();
  el('mudo').onclick = () => sala.alternarMudo();
  el('som').onclick = async () => { await sala.ativarSom(); el('som').classList.add('hidden'); };
  el('cam').onclick = () => sala.alternarCamera().catch((e) => falha(e.name === 'NotAllowedError' ? { message: 'Permita o acesso à câmera.' } : e));
  // Compartilhar tela: abre as opções antes; se já estiver compartilhando, para
  el('tela').onclick = () => {
    if (sala.modoVideo === 'tela') return sala.alternarTela();
    el('opcoes').classList.toggle('hidden');
  };
  el('o-cancelar').onclick = () => el('opcoes').classList.add('hidden');
  el('o-ok').onclick = async () => {
    el('opcoes').classList.add('hidden');
    try {
      const r = await sala.alternarTela({ altura: Number(el('o-alt').value), fps: Number(el('o-fps').value), som: el('o-som').checked, movimento: el('o-tipo').value === 'jogo' });
      if (el('o-som').checked && !r?.comSom) toast('Compartilhando sem som: o navegador não liberou o áudio dessa janela. Para ter som, compartilhe a tela inteira ou uma aba.');
    } catch (e) { if (e.name !== 'NotAllowedError') falha(e); }
  };
  // Layout: grade (todos iguais) ou destaque (um grande + miniaturas). Clique num vídeo para destacá-lo.
  const salaEl = el('sala');
  // Várias transmissões fixadas ao mesmo tempo dividem a linha de cima; as demais viram miniaturas
  const aplicarFoco = () => {
    const fixos = salaEl.querySelectorAll('.participante.foco');
    salaEl.classList.toggle('destaque', fixos.length > 0);
    salaEl.style.setProperty('--span', String(12 / Math.min(fixos.length || 1, 4) | 0 || 12));
    if (fixos.length === 4) salaEl.style.setProperty('--span', '6'); // 2x2
    box.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('ativo', b.dataset.l === (fixos.length ? 'destaque' : 'grade')));
  };
  salaEl.addEventListener('click', (e) => {
    const t = e.target.closest('.participante');
    if (!t || e.target.closest('button')) return;
    if (!t.classList.contains('foco') && salaEl.querySelectorAll('.participante.foco').length >= 4) return toast('Máximo de 4 vídeos fixados.');
    t.classList.toggle('foco'); aplicarFoco();
  });
  box.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => {
    salaEl.querySelectorAll('.participante').forEach((t) => t.classList.remove('foco'));
    if (b.dataset.l === 'destaque') {
      // destaque: fixa quem está transmitindo vídeo (ou o primeiro)
      const comVideo = [...salaEl.querySelectorAll('.participante')].filter((t) => t.querySelector('video.v')?.style.display !== 'none').slice(0, 4);
      (comVideo.length ? comVideo : [salaEl.querySelector('.participante')]).forEach((t) => t?.classList.add('foco'));
    }
    aplicarFoco();
  });

  // Configurações de áudio
  const prefs = prefsAudio();
  box.querySelectorAll('[data-a]').forEach((c) => (c.checked = prefs[c.dataset.a] !== false));
  el('cfg-audio').onclick = async () => {
    el('audio').classList.toggle('hidden');
    try {
      const mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId);
      el('a-mic').innerHTML = '<option value="">Padrão do sistema</option>' + mics.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === prefs.mic ? 'selected' : ''}>${esc(d.label || 'Microfone ' + (i + 1))}</option>`).join('');
    } catch { /* sem permissão ainda */ }
  };
  el('a-fechar').onclick = () => el('audio').classList.add('hidden');
  el('a-ok').onclick = async () => {
    const o = { mic: el('a-mic').value || null };
    box.querySelectorAll('[data-a]').forEach((c) => (o[c.dataset.a] = c.checked));
    Object.assign(prefs, o);
    try { if (sala) await sala.configurarAudio(o); else localStorage.setItem('cc_audio', JSON.stringify(o)); toast('Áudio atualizado.'); el('audio').classList.add('hidden'); } catch (e) { falha(e); }
  };

  // Abrir em janela separada (continua na call enquanto navega pelo site)
  el('popout')?.addEventListener('click', async () => {
    const url = `chamada.html?sala=${encodeURIComponent(salaId)}&titulo=${encodeURIComponent(titulo)}`;
    const w = window.open(url, 'cc-call', 'popup,width=960,height=640');
    if (!w) return toast('O navegador bloqueou a janela. Permita pop-ups para este site.', true);
    if (sala?.local) { await sala.sair(); toast('A call continua na janela nova.'); }
  });

  // Mini player: quando a call sai da tela (rolou a página ou trocou de aba da comunidade)
  document.querySelector('.call-flutuante')?.remove();
  const mini = document.createElement('div');
  mini.className = 'call-flutuante hidden';
  mini.innerHTML = `<span>🔊 Em call · <strong>${esc(titulo)}</strong></span><button class="btn sec pequeno" data-m="mudo">🎤</button><button class="btn pequeno" data-m="ir">Voltar</button><button class="btn perigo pequeno" data-m="sair">Sair</button>`;
  document.body.append(mini);
  mini.querySelector('[data-m="ir"]').onclick = () => { const aba = document.querySelector('.aba[data-a="call"]'); aba?.click(); box.scrollIntoView({ behavior: 'smooth' }); };
  mini.querySelector('[data-m="mudo"]').onclick = () => { sala?.alternarMudo(); mini.querySelector('[data-m="mudo"]').textContent = sala?.mudo ? '🔇' : '🎤'; };
  mini.querySelector('[data-m="sair"]').onclick = () => sala?.sair();
  const atualizarMini = () => {
    const r = box.getBoundingClientRect();
    const visivel = box.offsetParent !== null && r.bottom > 80 && r.top < innerHeight - 80;
    mini.classList.toggle('hidden', !sala?.local || visivel);
  };
  addEventListener('scroll', atualizarMini, { passive: true });
  document.addEventListener('click', () => setTimeout(atualizarMini, 50));
  setInterval(atualizarMini, 1500);

  el('form-chat').onsubmit = (e) => { e.preventDefault(); const t = el('txt').value.trim(); if (t) { sala.enviarChat(t); el('txt').value = ''; } };
  window.addEventListener('beforeunload', () => sala?.sair());
  return { sair: () => sala?.sair() };
}
