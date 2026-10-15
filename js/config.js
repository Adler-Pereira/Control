// Preencha com os dados do SEU projeto Supabase (Project Settings > API).
// A "anon public key" foi feita para ficar no navegador: quem protege os dados
// são as regras de segurança (RLS) do supabase/schema.sql.
// NUNCA coloque aqui a "service_role key".
export const SUPABASE_URL = 'COLE_AQUI_A_URL_DO_PROJETO';
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_ANON_KEY';

// Servidores STUN/TURN usados nas chamadas de voz/vídeo.
// STUN público funciona para a maioria das redes. Se alguém não conseguir
// conectar (rede corporativa, 4G restrito), adicione um servidor TURN aqui.
export const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
