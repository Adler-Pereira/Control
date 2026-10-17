// Steam Web API compartilhada pela importação (site) e pelo robô semanal.
const chave = () => (process.env.STEAM_API_KEY || '').trim();

export async function steam(metodo, params, ms = 15000) {
  const q = new URLSearchParams({ key: chave(), format: 'json', ...params });
  const r = await fetch(`https://api.steampowered.com/${metodo}/?${q}`, { signal: AbortSignal.timeout(ms) });
  if (r.status === 403) throw Object.assign(new Error('Chave da Steam inválida no servidor.'), { status: 503 });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);
  return r.json();
}

// Conquistas dos jogos mais jogados (a Steam exige uma consulta por jogo, então limitamos aos 12 com mais horas):
// total desbloqueado, e as mais raras (menor % de jogadores no mundo) para a vitrine do perfil.
export async function importarConquistas(sid, jogos, porAppid, uid, api) {
  const top = jogos.filter((g) => g.playtime_forever > 0).sort((a, b) => b.playtime_forever - a.playtime_forever).slice(0, 12);
  const res = await Promise.allSettled(top.map(async (g) => {
    const [eu, glob, esq] = await Promise.all([
      steam('ISteamUserStats/GetPlayerAchievements/v1', { steamid: sid, appid: g.appid }, 6000),
      steam('ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2', { gameid: g.appid }, 6000).catch(() => ({})),
      steam('ISteamUserStats/GetSchemaForGame/v2', { appid: g.appid, l: 'brazilian' }, 6000).catch(() => ({})),
    ]);
    const lista = eu.playerstats?.achievements || [];
    const pct = Object.fromEntries((glob.achievementpercentages?.achievements || []).map((a) => [a.name, Number(a.percent)]));
    const info = Object.fromEntries((esq.game?.availableGameStats?.achievements || []).map((a) => [a.name, a]));
    const feitas = lista.filter((a) => a.achieved === 1);
    return { g, total: lista.length, feitas: feitas.length,
      raras: feitas.map((a) => ({ jogo: g.name, nome: info[a.apiname]?.displayName || a.apiname, icone: info[a.apiname]?.icon || null, pct: pct[a.apiname] ?? 100 })) };
  }));
  const ok = res.filter((r) => r.status === 'fulfilled' && r.value.total).map((r) => r.value);
  for (const r of ok) {
    const gid = porAppid.get(r.g.appid);
    if (gid) await api(`user_games?user_id=eq.${uid}&game_id=eq.${gid}`, { method: 'PATCH', body: { ach_done: r.feitas, ach_total: r.total } }).catch(() => {});
  }
  const total = ok.reduce((t, r) => t + r.feitas, 0);
  const raras = ok.flatMap((r) => r.raras).filter((a) => a.pct < 100).sort((a, b) => a.pct - b.pct).slice(0, 6)
    .map((a) => ({ ...a, pct: Math.round(a.pct * 10) / 10, icone: /^https:\/\/[a-z0-9.-]+\.(steamstatic\.com|akamaihd\.net)\//.test(a.icone || '') ? a.icone : null }));
  await api(`profiles?id=eq.${uid}`, { method: 'PATCH', body: { steam_conquistas: { total, jogos: ok.length, raras, em: new Date().toISOString() } } });
  return { total };
}
