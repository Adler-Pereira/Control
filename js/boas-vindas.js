// Boas-vindas para contas novas: 3 passos rápidos (gostos, comunidades e próximos passos).
// Só aparece uma vez (profiles.onboarded).
import { sb, esc, toast } from './app.js';

export async function boasVindas(p) {
  if (location.pathname.endsWith('entrar.html') || document.querySelector('#dlg-boas-vindas')) return;
  const [{ data: cats }, { data: comms }] = await Promise.all([
    sb.from('categories').select('id,name').order('name'),
    sb.from('communities').select('id,name,members_count,is_private').eq('is_private', false).order('members_count', { ascending: false }).limit(8),
  ]);
  const favs = new Set(p.fav_categories || []), entrar = new Set();
  const dlg = document.createElement('dialog');
  dlg.id = 'dlg-boas-vindas';
  dlg.style.width = 'min(620px, 96vw)';
  document.body.append(dlg);
  let passo = 0;

  const passos = [
    () => `<h2 style="margin-top:0">👋 Bem-vindo ao Control Critic, ${esc(p.username)}!</h2>
      <p class="muted">Do que você gosta de jogar? Usamos isso nas suas recomendações (dá para mudar depois no perfil).</p>
      <div class="chips" style="margin-top:12px">${(cats || []).map((c) => `<button type="button" class="chip ${favs.has(c.id) ? 'ativo' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('')}</div>`,
    () => `<h2 style="margin-top:0">👥 Entre em algumas comunidades</h2>
      <p class="muted">É onde rolam o mural, as partidas marcadas e as calls com tela compartilhada.</p>
      <div class="chips" style="margin-top:12px">${(comms || []).map((c) => `<button type="button" class="chip ${entrar.has(c.id) ? 'ativo' : ''}" data-com="${c.id}">${esc(c.name)} · ${c.members_count}</button>`).join('') || '<span class="muted">Ainda não há comunidades públicas.</span>'}</div>`,
    () => `<h2 style="margin-top:0">🚀 Tudo pronto!</h2>
      <div class="lista" style="margin-top:8px">
        <a class="cartao" href="perfil.html">🖥️ <strong>Importe sua biblioteca da Steam</strong> e mostre seus jogos favoritos na vitrine do perfil</a>
        <a class="cartao" href="amigos.html">🤝 <strong>Adicione amigos</strong> para conversar, fazer call e ver o que estão jogando</a>
        <a class="cartao" href="conquistas.html">🔥 <strong>Entre todo dia</strong>: ganhe XP, molduras e banners exclusivos</a>
        <a class="cartao" href="index.html#grupo">🎮 <strong>Procurando grupo?</strong> Publique "quero jogar agora" na página inicial</a>
      </div>`,
  ];

  const desenhar = () => {
    dlg.innerHTML = `${passos[passo]()}
      <div class="controles" style="margin-top:18px;align-items:center">
        <span class="muted" style="flex:1">Passo ${passo + 1} de ${passos.length}</span>
        ${passo ? '<button type="button" class="btn sec" data-ir="-1">Voltar</button>' : '<button type="button" class="btn sec" data-pular>Pular</button>'}
        <button type="button" class="btn" data-ir="1">${passo === passos.length - 1 ? 'Começar' : 'Continuar'}</button>
      </div>`;
    dlg.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { const id = Number(b.dataset.cat); favs.has(id) ? favs.delete(id) : favs.add(id); b.classList.toggle('ativo'); });
    dlg.querySelectorAll('[data-com]').forEach((b) => b.onclick = () => { const id = Number(b.dataset.com); entrar.has(id) ? entrar.delete(id) : entrar.add(id); b.classList.toggle('ativo'); });
    dlg.querySelector('[data-pular]')?.addEventListener('click', () => concluir());
    dlg.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => {
      passo += Number(b.dataset.ir);
      if (passo >= passos.length) return concluir();
      desenhar();
    });
  };

  async function concluir() {
    dlg.close(); dlg.remove();
    await sb.from('profiles').update({ onboarded: true, fav_categories: [...favs] }).eq('id', p.id);
    for (const cid of entrar) await sb.rpc('join_community', { cid, codigo: null, mensagem: null });
    if (favs.size || entrar.size) toast('Perfil configurado! Suas recomendações já foram ajustadas.');
  }

  desenhar();
  dlg.showModal();
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); concluir(); });
}
