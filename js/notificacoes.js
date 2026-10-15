import { sb, $, esc, montarLayout, configurado, exigirLogin, data, falha } from './app.js';

await montarLayout();
const main = $('#conteudo');
const ICONES = { follow: '👤', deal: '💸', event: '📅', reminder: '⏰', report: '🚩', reward: '🏆', levelup: '⬆️', friend: '🤝', call: '📞', request: '🔒' };

if (configurado) {
  const u = await exigirLogin();
  if (u) carregar(u);
}

async function carregar(u) {
  const { data: ns, error } = await sb.from('notifications').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(100);
  if (error) return falha(error);
  const naoLidas = ns.filter((n) => !n.read).length;
  main.innerHTML = `<h1>Notificações</h1>
    <div class="controles" style="margin-bottom:14px">
      <button class="btn sec pequeno" id="todas" ${naoLidas ? '' : 'disabled'}>Marcar todas como lidas</button>
      <button class="btn sec pequeno" id="limpar" ${ns.length ? '' : 'disabled'}>Apagar todas</button>
    </div>
    <div class="lista">${ns.map((n) => `
      <a class="cartao notif ${n.read ? '' : 'nao-lida'}" href="${/^[a-z]+\.html[\w?=&#.%-]*$/i.test(n.link || '') ? esc(n.link) : '#'}" data-id="${n.id}" style="color:var(--texto);text-decoration:none">
        <span style="font-size:1.5rem">${ICONES[n.type] || '🔔'}</span>
        <span style="flex:1"><strong>${esc(n.title)}</strong>${n.body ? `<br><span class="muted">${esc(n.body)}</span>` : ''}
          <br><span class="muted" style="font-size:.8rem">${data(n.created_at)}</span></span>
      </a>`).join('') || '<p class="vazio">Nenhuma notificação por enquanto. Adicione jogos à lista de desejos e participe de comunidades para receber avisos.</p>'}
    </div>`;

  main.querySelectorAll('.notif').forEach((a) => a.addEventListener('click', () => {
    sb.from('notifications').update({ read: true }).eq('id', a.dataset.id).then(() => {});
  }));
  $('#todas').onclick = async () => {
    const { error } = await sb.from('notifications').update({ read: true }).eq('user_id', u.id).eq('read', false);
    error ? falha(error) : location.reload();
  };
  $('#limpar').onclick = async () => {
    if (!confirm('Apagar todas as notificações?')) return;
    const { error } = await sb.from('notifications').delete().eq('user_id', u.id);
    error ? falha(error) : location.reload();
  };
}
