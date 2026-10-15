import { sb, $, esc, montarLayout, configurado, exigirLogin, perfil, data, toast, falha, urlSegura } from './app.js';

await montarLayout();
const main = $('#conteudo');
let P;

const ABAS = [
  ['geral', 'Visão geral'], ['jogos', 'Jogos'], ['noticias', 'Notícias'], ['promos', 'Promoções'],
  ['reviews', 'Avaliações'], ['posts', 'Posts'], ['comunidades', 'Comunidades'], ['mensagens', 'Mensagens'],
  ['usuarios', 'Usuários', true], ['auto', 'Automação', true],
];

function iniciar() {
  const abas = ABAS.filter(([, , soAdmin]) => !soAdmin || P.role === 'admin');
  main.innerHTML = `<h1>Painel de Admin</h1>
    <div class="abas">${abas.map(([k, t], i) => `<button class="aba ${i ? '' : 'ativo'}" data-a="${k}">${t}</button>`).join('')}</div>
    <div id="painel"></div><dialog id="dlg"></dialog>`;
  main.querySelectorAll('.aba').forEach((b) => b.onclick = () => {
    main.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativo', x === b));
    abrir(b.dataset.a);
  });
  abrir('geral');
}

const painel = () => $('#painel');
const VIEWS = { geral, jogos, noticias, promos, reviews, posts, comunidades, mensagens, usuarios, auto };
function abrir(k) { painel().innerHTML = '<p class="muted">Carregando...</p>'; VIEWS[k]().catch(falha); }

// Formulário genérico em <dialog>. campos: [nome, rótulo, tipo, opções]
function formulario(titulo, campos, valores = {}) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog"><h2 style="margin-top:0">${esc(titulo)}</h2>
    ${campos.map(([n, r, tipo = 'text', ops]) => {
      const v = valores[n] ?? '';
      if (tipo === 'textarea') return `<label>${r}</label><textarea name="${n}" rows="5">${esc(v)}</textarea>`;
      if (tipo === 'checkbox') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${n}" style="width:auto" ${v ? 'checked' : ''}> ${r}</label>`;
      if (tipo === 'select') return `<label>${r}</label><select name="${n}"><option value="">—</option>${ops.map(([ov, ot]) => `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ot)}</option>`).join('')}</select>`;
      if (tipo === 'file') return `<label>${r}</label><input type="file" name="${n}" accept="image/*">`;
      return `<label>${r}</label><input type="${tipo}" name="${n}" value="${esc(v)}">`;
    }).join('')}
    <div class="controles" style="margin-top:16px"><button class="btn" value="ok">Salvar</button><button class="btn sec" value="cancel" formnovalidate>Cancelar</button></div></form>`;
  dlg.showModal();
  return new Promise((ok) => dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'ok') return ok(null);
    const f = dlg.querySelector('form'), out = {};
    for (const [n, , tipo] of campos) {
      const el = f.elements[n];
      if (tipo === 'checkbox') out[n] = el.checked;
      else if (tipo === 'file') out[n] = el.files[0] || null;
      else if (tipo === 'number') out[n] = el.value === '' ? null : Number(el.value);
      else out[n] = el.value.trim() === '' ? null : el.value.trim();
    }
    ok(out);
  }, { once: true }));
}

async function upload(arq, pasta) {
  if (!arq) return undefined;
  const caminho = `${pasta}/${Date.now()}-${arq.name.replace(/[^\w.-]/g, '_')}`;
  const { error } = await sb.storage.from('media').upload(caminho, arq);
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(caminho).data.publicUrl;
}

function tabela(cab, linhas) {
  return `<div class="tabela-wrap"><table><thead><tr>${cab.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${linhas.join('') || `<tr><td colspan="${cab.length}" class="muted">Nada por aqui.</td></tr>`}</tbody></table></div>`;
}

function acoes(handlers) {
  painel().querySelectorAll('[data-acao]').forEach((b) => b.onclick = async () => {
    try { await handlers[b.dataset.acao](b.dataset.id, b); } catch (e) { falha(e); }
  });
}

const reais = (c) => c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const corta = (s, n = 80) => esc(s && s.length > n ? s.slice(0, n) + '…' : s || '');

// ---------------- Visão geral ----------------
async function geral() {
  const { data: s, error } = await sb.rpc('admin_stats');
  if (error) throw error;
  const k = (v, r) => `<div class="kpi"><div class="valor">${v}</div><div class="rotulo">${r}</div></div>`;
  painel().innerHTML = `<div class="kpis">
      ${k(s.users, 'usuários')}${k(s.users_7d, 'novos (7 dias)')}${k(s.games, 'jogos')}${k(s.reviews, 'avaliações')}
      ${k(s.reviews_7d, 'avaliações (7 dias)')}${k(s.communities, 'comunidades')}${k(s.posts, 'posts')}${k(s.messages_new, 'mensagens novas')}
    </div>
    <h2>Top jogos</h2>
    ${tabela(['Jogo', 'Nota', 'Avaliações'], s.top_games.map((g) => `<tr><td>${esc(g.title)}</td><td>${Number(g.avg_rating).toFixed(2)}</td><td>${g.reviews_count}</td></tr>`))}`;
}

// ---------------- Jogos ----------------
async function jogos() {
  const [{ data: gs }, { data: cats }] = await Promise.all([
    sb.from('games').select('*, categories(name)').order('title'), sb.from('categories').select('*').order('name')]);
  const campos = [
    ['title', 'Título'], ['slug', 'Slug (endereço, ex.: elden-ring)'], ['description', 'Descrição', 'textarea'],
    ['category_id', 'Categoria', 'select', cats.map((c) => [c.id, c.name])], ['release_year', 'Ano de lançamento', 'number'],
    ['cover_url', 'URL da capa (ou envie um arquivo abaixo)'], ['capa', 'Enviar capa', 'file'], ['featured', 'Destaque na página inicial', 'checkbox'],
    ['store_ps', 'Link PlayStation'], ['store_xbox', 'Link Xbox'], ['store_steam', 'Link Steam'], ['store_nintendo', 'Link Nintendo'],
    ['steam_appid', 'ID na Steam (para promoções e notícias automáticas)', 'number'],
  ];
  painel().innerHTML = `<div class="controles" style="margin-bottom:12px"><button class="btn" data-acao="novo">+ Novo jogo</button></div>
    ${tabela(['Jogo', 'Categoria', 'Nota', 'Destaque', ''], gs.map((g) => `<tr>
      <td><a href="jogo.html?slug=${encodeURIComponent(g.slug)}" target="_blank">${esc(g.title)}</a></td><td>${esc(g.categories?.name || '—')}</td>
      <td>${Number(g.avg_rating).toFixed(1)} (${g.reviews_count})</td><td>${g.featured ? '⭐' : ''}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="editar" data-id="${g.id}">Editar</button>
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${g.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const dados = await formulario(id ? 'Editar jogo' : 'Novo jogo', campos, v);
    if (!dados) return;
    const url = await upload(dados.capa, 'capas');
    delete dados.capa;
    if (url) dados.cover_url = url;
    if (!dados.slug && dados.title) dados.slug = dados.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { error } = id ? await sb.from('games').update(dados).eq('id', id) : await sb.from('games').insert(dados);
    if (error) throw error;
    toast('Jogo salvo.'); jogos();
  };
  acoes({
    novo: () => salvar({}),
    editar: (id) => salvar(gs.find((g) => g.id == id), id),
    excluir: async (id) => {
      if (!confirm('Excluir o jogo e todas as avaliações dele?')) return;
      const { error } = await sb.from('games').delete().eq('id', id); if (error) throw error; jogos();
    },
  });
}

// ---------------- Notícias ----------------
async function noticias() {
  const [{ data: ns }, { data: gs }] = await Promise.all([
    sb.from('news').select('*').order('created_at', { ascending: false }).limit(200), sb.from('games').select('id,title').order('title')]);
  const campos = [['title', 'Título'], ['summary', 'Resumo (aparece na página inicial)'], ['body', 'Texto', 'textarea'],
    ['game_id', 'Jogo relacionado', 'select', gs.map((g) => [g.id, g.title])], ['cover_url', 'URL da imagem'], ['imagem', 'Enviar imagem', 'file'],
    ['published', 'Publicada', 'checkbox']];
  painel().innerHTML = `<div class="controles" style="margin-bottom:12px"><button class="btn" data-acao="novo">+ Escrever notícia</button></div>
    ${tabela(['Título', 'Fonte', 'Data', 'Status', ''], ns.map((n) => `<tr>
      <td>${n.source_url ? `<a href="${urlSegura(n.source_url)}" target="_blank" rel="noopener">${corta(n.title)}</a>` : corta(n.title)}</td>
      <td>${esc(n.source || 'Equipe')}</td><td>${data(n.created_at)}</td>
      <td>${n.published ? '<span class="tag amarela">publicada</span>' : '<span class="tag">pendente</span>'}</td>
      <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${n.id}">${n.published ? 'Despublicar' : 'Publicar'}</button>
      <button class="btn sec pequeno" data-acao="editar" data-id="${n.id}">Editar</button>
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${n.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const dados = await formulario(id ? 'Editar notícia' : 'Nova notícia', campos, v);
    if (!dados) return;
    const url = await upload(dados.imagem, 'noticias'); delete dados.imagem; if (url) dados.cover_url = url;
    if (!dados.title || !dados.body) return toast('Título e texto são obrigatórios.', true);
    const { error } = id ? await sb.from('news').update(dados).eq('id', id) : await sb.from('news').insert(dados);
    if (error) throw error; toast('Notícia salva.'); noticias();
  };
  acoes({
    novo: () => salvar({ published: true }),
    editar: (id) => salvar(ns.find((n) => n.id == id), id),
    alternar: async (id) => { const n = ns.find((x) => x.id == id); const { error } = await sb.from('news').update({ published: !n.published }).eq('id', id); if (error) throw error; noticias(); },
    excluir: async (id) => { if (!confirm('Excluir notícia?')) return; const { error } = await sb.from('news').delete().eq('id', id); if (error) throw error; noticias(); },
  });
}

// ---------------- Promoções ----------------
async function promos() {
  const [{ data: ds }, { data: gs }] = await Promise.all([
    sb.from('deals').select('*, games(title)').order('discount_pct', { ascending: false }), sb.from('games').select('id,title').order('title')]);
  const campos = [['game_id', 'Jogo', 'select', gs.map((g) => [g.id, g.title])],
    ['store', 'Loja', 'select', [['playstation', 'PlayStation'], ['xbox', 'Xbox'], ['nintendo', 'Nintendo'], ['steam', 'Steam'], ['outra', 'Outra']]],
    ['preco', 'Preço com desconto (R$)', 'number'], ['original', 'Preço original (R$)', 'number'], ['discount_pct', 'Desconto (%)', 'number'],
    ['url', 'Link da oferta'], ['ends_at', 'Termina em', 'date']];
  painel().innerHTML = `<p class="muted">Promoções da Steam são atualizadas automaticamente (marcadas como "auto"). Cadastre aqui ofertas de outras lojas.</p>
    <div class="controles" style="margin:12px 0"><button class="btn" data-acao="novo">+ Nova promoção</button></div>
    ${tabela(['Jogo', 'Loja', 'Preço', 'Desconto', 'Atualizada', ''], ds.map((d) => `<tr>
      <td>${esc(d.games?.title)}</td><td>${esc(d.store)} ${d.auto ? '<span class="tag">auto</span>' : ''}</td>
      <td>${reais(d.price_cents)} <s class="muted">${d.original_cents ? reais(d.original_cents) : ''}</s></td><td>${d.discount_pct}%</td><td>${data(d.updated_at)}</td>
      <td class="controles">${d.auto ? '' : `<button class="btn sec pequeno" data-acao="editar" data-id="${d.id}">Editar</button>`}
      <button class="btn perigo pequeno" data-acao="excluir" data-id="${d.id}">Excluir</button></td></tr>`))}`;
  const salvar = async (v, id) => {
    const d = await formulario(id ? 'Editar promoção' : 'Nova promoção', campos,
      { ...v, preco: v.price_cents != null ? v.price_cents / 100 : '', original: v.original_cents != null ? v.original_cents / 100 : '', ends_at: v.ends_at?.slice(0, 10) });
    if (!d) return;
    if (!d.game_id || !d.store) return toast('Escolha o jogo e a loja.', true);
    const dados = { game_id: Number(d.game_id), store: d.store, url: d.url, ends_at: d.ends_at,
      price_cents: d.preco == null ? null : Math.round(d.preco * 100), original_cents: d.original == null ? null : Math.round(d.original * 100),
      discount_pct: d.discount_pct ?? (d.preco && d.original ? Math.round((1 - d.preco / d.original) * 100) : 0), auto: false, updated_at: new Date().toISOString() };
    const { error } = id ? await sb.from('deals').update(dados).eq('id', id) : await sb.from('deals').upsert(dados, { onConflict: 'game_id,store' });
    if (error) throw error; toast('Promoção salva.'); promos();
  };
  acoes({
    novo: () => salvar({}),
    editar: (id) => salvar(ds.find((d) => d.id == id), id),
    excluir: async (id) => { const { error } = await sb.from('deals').delete().eq('id', id); if (error) throw error; promos(); },
  });
}

// ---------------- Moderação ----------------
async function reviews() {
  const { data: rs } = await sb.from('reviews').select('*, games(title), profiles(username)').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Usuário', 'Jogo', 'Nota', 'Comentário', 'Status', ''], rs.map((r) => `<tr>
    <td>${esc(r.profiles?.username)}</td><td>${esc(r.games?.title)}</td><td>${r.rating}★</td><td>${corta(r.body, 120)}</td>
    <td>${r.status === 'published' ? 'visível' : '<span class="tag">oculta</span>'}</td>
    <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${r.id}">${r.status === 'published' ? 'Ocultar' : 'Mostrar'}</button>
    <button class="btn perigo pequeno" data-acao="excluir" data-id="${r.id}">Excluir</button></td></tr>`));
  acoes({
    alternar: async (id) => { const r = rs.find((x) => x.id == id); const { error } = await sb.from('reviews').update({ status: r.status === 'published' ? 'hidden' : 'published' }).eq('id', id); if (error) throw error; reviews(); },
    excluir: async (id) => { if (!confirm('Excluir avaliação?')) return; const { error } = await sb.from('reviews').delete().eq('id', id); if (error) throw error; reviews(); },
  });
}

async function posts() {
  const { data: ps } = await sb.from('posts').select('*, communities(name), profiles(username)').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Usuário', 'Comunidade', 'Post', 'Data', ''], ps.map((p) => `<tr>
    <td>${esc(p.profiles?.username)}</td><td><a href="comunidade.html?id=${p.community_id}" target="_blank">${esc(p.communities?.name)}</a></td>
    <td>${corta(p.body, 140)}</td><td>${data(p.created_at)}</td>
    <td class="controles"><button class="btn sec pequeno" data-acao="alternar" data-id="${p.id}">${p.status === 'published' ? 'Ocultar' : 'Mostrar'}</button>
    <button class="btn perigo pequeno" data-acao="excluir" data-id="${p.id}">Excluir</button></td></tr>`));
  acoes({
    alternar: async (id) => { const p = ps.find((x) => x.id == id); const { error } = await sb.from('posts').update({ status: p.status === 'published' ? 'hidden' : 'published' }).eq('id', id); if (error) throw error; posts(); },
    excluir: async (id) => { if (!confirm('Excluir post?')) return; const { error } = await sb.from('posts').delete().eq('id', id); if (error) throw error; posts(); },
  });
}

async function comunidades() {
  const { data: cs } = await sb.from('communities').select('*, profiles!communities_owner_id_fkey(username)').order('created_at', { ascending: false });
  painel().innerHTML = tabela(['Comunidade', 'Dono', 'Membros', 'Discord', 'Criada', ''], cs.map((c) => `<tr>
    <td><a href="comunidade.html?id=${c.id}" target="_blank">${esc(c.name)}</a></td><td>${esc(c.profiles?.username || '—')}</td>
    <td>${c.members_count}</td><td>${c.discord_invite ? '✔' : ''}</td><td>${data(c.created_at)}</td>
    <td><button class="btn perigo pequeno" data-acao="excluir" data-id="${c.id}">Excluir</button></td></tr>`));
  acoes({ excluir: async (id) => { if (!confirm('Excluir comunidade e posts?')) return; const { error } = await sb.from('communities').delete().eq('id', id); if (error) throw error; comunidades(); } });
}

async function mensagens() {
  const { data: ms } = await sb.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(200);
  painel().innerHTML = tabela(['Data', 'Nome', 'E-mail', 'Mensagem', 'Status', ''], ms.map((m) => `<tr>
    <td>${data(m.created_at)}</td><td>${esc(m.name)}${m.age ? ` <span class="muted">(${m.age})</span>` : ''}</td>
    <td><a href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: Control Critic')}">${esc(m.email)}</a></td>
    <td class="quebra">${esc(m.message)}</td>
    <td><select data-id="${m.id}" class="st" style="width:auto">${['novo', 'lido', 'respondido'].map((s) => `<option ${s === m.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
    <td><button class="btn perigo pequeno" data-acao="excluir" data-id="${m.id}">Excluir</button></td></tr>`));
  painel().querySelectorAll('select.st').forEach((s) => s.onchange = async () => {
    const { error } = await sb.from('contact_messages').update({ status: s.value }).eq('id', s.dataset.id);
    error ? falha(error) : toast('Status atualizado.');
  });
  acoes({ excluir: async (id) => { if (!confirm('Excluir mensagem?')) return; const { error } = await sb.from('contact_messages').delete().eq('id', id); if (error) throw error; mensagens(); } });
}

// ---------------- Usuários (somente admin) ----------------
async function usuarios() {
  const { data: us } = await sb.from('profiles').select('*').order('created_at', { ascending: false }).limit(500);
  painel().innerHTML = `<input id="filtro" placeholder="Filtrar por nome..." style="max-width:320px;margin-bottom:12px">
    ${tabela(['Usuário', 'XP', 'Papel', 'Situação', 'Desde', ''], us.map((u) => `<tr data-nome="${esc(u.username.toLowerCase())}">
      <td>${esc(u.username)}</td><td>${u.xp}</td>
      <td><select class="papel" data-id="${u.id}" style="width:auto" ${u.id === P.id ? 'disabled' : ''}>${['user', 'moderator', 'admin'].map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td>${u.banned ? '<span class="tag" style="background:var(--perigo);color:#fff">banido</span>' : 'ativo'}</td><td>${data(u.created_at)}</td>
      <td>${u.id === P.id ? '' : `<button class="btn ${u.banned ? 'sec' : 'perigo'} pequeno" data-acao="ban" data-id="${u.id}">${u.banned ? 'Desbanir' : 'Banir'}</button>`}</td></tr>`))}`;
  $('#filtro').oninput = (e) => painel().querySelectorAll('tbody tr[data-nome]').forEach((tr) => tr.classList.toggle('hidden', !tr.dataset.nome.includes(e.target.value.toLowerCase())));
  painel().querySelectorAll('select.papel').forEach((s) => s.onchange = async () => {
    if (!confirm(`Mudar o papel para "${s.value}"?`)) return usuarios();
    const { error } = await sb.from('profiles').update({ role: s.value }).eq('id', s.dataset.id);
    error ? falha(error) : toast('Papel atualizado.');
  });
  acoes({ ban: async (id) => {
    const u = us.find((x) => x.id === id);
    if (!confirm(u.banned ? 'Desbanir usuário?' : 'Banir usuário? Ele não poderá mais publicar.')) return;
    const { error } = await sb.from('profiles').update({ banned: !u.banned }).eq('id', id); if (error) throw error; usuarios();
  } });
}

// ---------------- Automação (somente admin) ----------------
async function auto() {
  const { data: st } = await sb.from('settings').select('*');
  const cfg = Object.fromEntries((st || []).map((s) => [s.key, s.value]));
  const ultimo = cfg.last_sync;
  painel().innerHTML = `
    <div class="cartao">
      <h3>Robô de notícias e promoções</h3>
      <p class="muted">Roda automaticamente pelo GitHub Actions a cada 6 horas (arquivo <code>.github/workflows/sync.yml</code>).
      Também pode ser disparado manualmente em GitHub → Actions → "Sincronizar notícias e promoções" → Run workflow.</p>
      <p style="margin-top:10px"><strong>Última execução:</strong> ${ultimo?.at ? `${new Date(ultimo.at).toLocaleString('pt-BR')} —
        ${ultimo.news ?? 0} notícia(s) nova(s), ${ultimo.deals ?? 0} preço(s) atualizado(s)${ultimo.errors?.length ? `, <span style="color:var(--perigo)">${ultimo.errors.length} erro(s)</span>` : ''}` : 'ainda não executou'}</p>
      ${ultimo?.errors?.length ? `<ul class="muted" style="margin:6px 0 0 18px">${ultimo.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="cartao" style="margin-top:14px">
      <h3>Catálogo automático (IGDB)</h3>
      <p class="muted">Todo dia o robô "Importar jogos (IGDB)" adiciona os próximos 2.000 jogos mais populares e os lançamentos recentes.
      Além disso, quando alguém busca um jogo que não está no site, ele é importado na hora.</p>
      <p style="margin-top:10px"><strong>Última importação:</strong> ${cfg.last_igdb?.at ? `${new Date(cfg.last_igdb.at).toLocaleString('pt-BR')} —
        ${cfg.last_igdb.novos ?? 0} jogo(s) novo(s), ${cfg.last_igdb.completados ?? 0} atualizado(s); catálogo com ${(cfg.last_igdb.catalogo ?? 0).toLocaleString('pt-BR')} jogos` : 'ainda não executou'}</p>
    </div>
    <form class="cartao" id="form-auto" style="margin-top:14px">
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="autopub" style="width:auto" ${cfg.auto_publish_news ? 'checked' : ''}>
        Publicar notícias oficiais automaticamente (desmarcado = ficam pendentes para aprovação na aba Notícias)</label>
      <label>Feeds RSS oficiais (um por linha: Nome | URL)</label>
      <textarea id="feeds" rows="6">${esc((cfg.feeds || []).map((f) => `${f.name} | ${f.url}`).join('\n'))}</textarea>
      <p class="muted" style="font-size:.85rem;margin-top:6px">Além destes, o robô busca as notícias oficiais da Steam de cada jogo que tem "ID na Steam" cadastrado.</p>
      <button class="btn" style="margin-top:12px">Salvar</button>
    </form>`;
  $('#form-auto').onsubmit = async (e) => {
    e.preventDefault();
    const feeds = $('#feeds').value.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter(([n, u]) => n && /^https:\/\//.test(u || '')).map(([name, url]) => ({ name, url }));
    const { error } = await sb.from('settings').upsert([{ key: 'auto_publish_news', value: $('#autopub').checked }, { key: 'feeds', value: feeds }]);
    error ? falha(error) : toast('Configurações salvas.');
  };
}

// ---------------- Início ----------------
// Fica no fim do arquivo: as constantes acima (ABAS, VIEWS) precisam existir antes de montar o painel.
if (configurado && (await exigirLogin())) {
  P = await perfil();
  if (!P || P.role === 'user') {
    main.innerHTML = `<div class="cartao" style="max-width:560px;margin:24px auto"><h2 style="margin-top:0">Acesso restrito à equipe</h2>
      <p class="muted">Sua conta (${esc(P?.username || '')}) ainda não é admin. Peça a um admin para mudar seu papel na aba Usuários,
      ou, se for a primeira conta, rode no SQL Editor do Supabase:</p>
      <pre style="background:var(--cartao-2);padding:10px;border-radius:8px;margin-top:10px;overflow-x:auto">update profiles set role = 'admin' where username = '${esc(P?.username || 'SEU_USUARIO')}';</pre></div>`;
  } else iniciar();
}
