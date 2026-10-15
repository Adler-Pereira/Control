import { sb, $, $$, esc, montarLayout, cardJogo, configurado, param, usuario, toast, falha } from './app.js';

await montarLayout();
const main = $('#conteudo');
const POR_PAGINA = 48;
const PLATAFORMAS = ['PlayStation', 'Xbox', 'PC', 'Nintendo', 'Mobile'];

main.insertAdjacentHTML('beforeend', `
  <h1>Jogos</h1>
  <div class="form-linha" style="margin-bottom:12px">
    <input id="q" type="search" placeholder="Buscar pelo nome..." value="${esc(param('q') || '')}">
    <select id="ordem">
      <option value="igdb_rating_count">Mais populares</option>
      <option value="avg_rating">Mais bem avaliados no Control Critic</option>
      <option value="igdb_rating">Melhor nota da crítica</option>
      <option value="release_year">Lançamentos mais recentes</option>
      <option value="title">Ordem alfabética</option>
    </select>
  </div>
  <div class="chips" id="plats"><button class="chip" data-p="">Todas as plataformas</button>${PLATAFORMAS.map((p) => `<button class="chip" data-p="${p}">${p}</button>`).join('')}</div>
  <div class="chips" id="cats"></div>
  <p class="muted" id="contagem" style="margin-bottom:10px"></p>
  <div class="grade" id="lista"></div>
  <div style="text-align:center;margin:20px 0"><button class="btn sec hidden" id="mais">Carregar mais</button></div>
  <section class="cartao hidden" id="ampliada" style="margin-top:12px">
    <h3>Não encontrou? Busque em todas as plataformas</h3>
    <p class="muted">Procura no catálogo completo (PlayStation, Xbox, PC, Nintendo e mobile) e adiciona o jogo ao Control Critic.</p>
    <button class="btn" id="buscar-ampliado" style="margin-top:10px">🔎 Buscar "<span id="termo"></span>" em todas as plataformas</button>
    <div class="lista" id="resultados" style="margin-top:14px"></div>
  </section>`);

let cat = param('cat') || '', plat = param('plat') || '', pagina = 0;
if (configurado) {
  const { data: cats } = await sb.from('categories').select('*').order('name');
  $('#cats').innerHTML = `<button class="chip" data-c="">Todas as categorias</button>` +
    (cats || []).map((c) => `<button class="chip" data-c="${c.id}">${esc(c.name)}</button>`).join('');
  $$('#cats .chip').forEach((b) => b.onclick = () => { cat = b.dataset.c; carregar(); });
  $$('#plats .chip').forEach((b) => b.onclick = () => { plat = b.dataset.p; carregar(); });
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(carregar, 350); };
  $('#ordem').onchange = () => carregar();
  $('#mais').onclick = () => carregar(true);
  $('#buscar-ampliado').onclick = buscarAmpliado;
  carregar();
}

async function carregar(continuar = false) {
  pagina = continuar ? pagina + 1 : 0;
  $$('#cats .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.c === String(cat)));
  $$('#plats .chip').forEach((b) => b.classList.toggle('ativo', b.dataset.p === plat));
  const ordem = $('#ordem').value;
  let q = sb.from('games').select('*, categories(name)', { count: 'exact' })
    .order(ordem, { ascending: ordem === 'title', nullsFirst: false })
    .order('igdb_rating_count', { ascending: false })
    .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  const termo = $('#q').value.trim().replace(/[%,()]/g, '');
  if (termo) q = q.ilike('title', `%${termo}%`);
  if (cat) q = q.eq('category_id', cat);
  if (plat) q = q.contains('platforms', [plat]);
  const { data, error, count } = await q;
  if (error) { $('#lista').innerHTML = '<p class="vazio">Erro ao carregar.</p>'; return; }

  const html = data.map(cardJogo).join('');
  if (continuar) $('#lista').insertAdjacentHTML('beforeend', html);
  else $('#lista').innerHTML = html || '<p class="vazio">Nenhum jogo encontrado no Control Critic.</p>';
  $('#contagem').textContent = `${(count ?? 0).toLocaleString('pt-BR')} jogo(s)`;
  $('#mais').classList.toggle('hidden', (pagina + 1) * POR_PAGINA >= (count ?? 0));

  // Busca ampliada aparece quando há termo e poucos resultados
  $('#ampliada').classList.toggle('hidden', !(termo.length >= 2 && (count ?? 0) < 6));
  $('#termo').textContent = termo;
  $('#resultados').innerHTML = '';
}

async function buscarAmpliado() {
  const termo = $('#q').value.trim();
  const box = $('#resultados');
  box.innerHTML = '<p class="muted">Buscando...</p>';
  try {
    const r = await fetch(`/.netlify/functions/buscar-jogo?q=${encodeURIComponent(termo)}`);
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'Falha na busca.');
    if (!dados.length) { box.innerHTML = '<p class="vazio">Nada encontrado com esse nome.</p>'; return; }
    const logado = !!(await usuario());
    box.innerHTML = dados.map((g) => `
      <div class="review" style="display:flex;gap:12px;align-items:center">
        ${g.capa ? `<img src="${esc(g.capa)}" alt="" style="width:45px;height:64px;object-fit:cover;border-radius:6px">` : ''}
        <div style="flex:1"><strong>${esc(g.titulo)}</strong> ${g.ano ? `<span class="muted">(${g.ano})</span>` : ''}<br>
          ${g.plataformas.map((p) => `<span class="tag">${esc(p)}</span>`).join(' ')}</div>
        ${g.slug_no_site ? `<a class="btn sec pequeno" href="jogo.html?slug=${encodeURIComponent(g.slug_no_site)}">Ver no site</a>`
          : logado ? `<button class="btn pequeno" data-add="${g.igdb_id}">+ Adicionar</button>`
          : `<a class="btn sec pequeno" href="entrar.html?volta=jogos.html">Entre para adicionar</a>`}
      </div>`).join('');
    box.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => adicionar(Number(b.dataset.add), b));
  } catch (e) { box.innerHTML = ''; falha(e); }
}

async function adicionar(igdbId, botao) {
  botao.disabled = true; botao.textContent = 'Adicionando...';
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch('/.netlify/functions/buscar-jogo', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ igdb_id: igdbId }),
    });
    const dados = await r.json();
    if (!r.ok) throw new Error(dados.erro || 'Não foi possível adicionar.');
    toast('Jogo adicionado ao Control Critic! +5 XP');
    location.href = 'jogo.html?slug=' + encodeURIComponent(dados.slug);
  } catch (e) { falha(e); botao.disabled = false; botao.textContent = '+ Adicionar'; }
}
