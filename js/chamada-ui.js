// Interface da call (usada nas comunidades e na call entre amigos)
import { $, esc, falha, toast } from './app.js';
import { SalaVoz } from './voz.js';

export function montarCall(box, { salaId, u, p, descricao = '' }) {
  box.innerHTML = `
    ${descricao ? `<p class="muted">${descricao}</p>` : ''}
    <div class="controles" style="margin:12px 0">
      <button class="btn" data-v="entrar">🔊 Entrar na call</button>
      <button class="btn sec hidden" data-v="mudo">🎤 Silenciar</button>
      <button class="btn sec hidden" data-v="cam">📷 Câmera</button>
      <button class="btn sec hidden" data-v="tela">🖥️ Compartilhar tela</button>
      <button class="btn sec hidden" data-v="som">🔈 Ativar som</button>
      <button class="btn perigo hidden" data-v="sair">Sair da call</button>
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
      <span class="controles hidden" data-v="layout"><button class="chip ativo" data-l="grade">▦ Grade</button><button class="chip" data-l="destaque">⬛ Destaque</button></span>
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
  const destacar = (tile) => {
    salaEl.querySelectorAll('.participante').forEach((t) => t.classList.toggle('foco', t === tile));
    salaEl.classList.toggle('destaque', !!tile);
    box.querySelectorAll('[data-l]').forEach((b) => b.classList.toggle('ativo', b.dataset.l === (tile ? 'destaque' : 'grade')));
  };
  salaEl.addEventListener('click', (e) => {
    const t = e.target.closest('.participante');
    if (!t || e.target.closest('button')) return;
    destacar(t.classList.contains('foco') ? null : t);
  });
  box.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => {
    if (b.dataset.l === 'grade') return destacar(null);
    // destaque: escolhe quem está transmitindo vídeo (ou o primeiro)
    const comVideo = [...salaEl.querySelectorAll('.participante')].find((t) => t.querySelector('video.v').style.display !== 'none');
    destacar(comVideo || salaEl.querySelector('.participante'));
  });
  el('form-chat').onsubmit = (e) => { e.preventDefault(); const t = el('txt').value.trim(); if (t) { sala.enviarChat(t); el('txt').value = ''; } };
  window.addEventListener('beforeunload', () => sala?.sair());
  return { sair: () => sala?.sair() };
}
