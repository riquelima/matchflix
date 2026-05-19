const TMDB_API_KEY = "416394469462693ee5727abe4c864848";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kewwqxfpjzrxduhoqfxw.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";

export default async function handler(req, res) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  console.time(`[Bootstrap] Execution for ${userId}`);

  try {
    // Helper para chamadas resilientes à TMDB
    async function safeFetchTMDB(endpoint, params = {}) {
      try {
        const query = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'pt-BR', ...params });
        const url = `https://api.themoviedb.org/3/${endpoint}?${query.toString()}`;
        const resp = await fetch(url);
        if (!resp.ok) return { results: [] };
        return await resp.json();
      } catch (e) {
        return { results: [] };
      }
    }

    // DEFINIÇÃO DOS PROCESSOS PARALELOS
    
    // 1. Gêneros
    const genresPromise = safeFetchTMDB('genre/movie/list');

    // 2. Histórico do Usuário (Busca no Supabase via REST)
    // Usamos select inline e query param de filtro
    const historyPromise = (async () => {
        try {
            // Supabase REST URL para a tabela curtidas_filmes
            // Trazemos um limite alto para garantir histórico completo numa chamada só
            const url = `${SUPABASE_URL}/rest/v1/curtidas_filmes?usuario_id=eq.${userId}&select=filme_id,assistido,curtiu,criado_em&order=criado_em.desc&limit=2500`;
            const resp = await fetch(url, {
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (!resp.ok) return [];
            return await resp.json();
        } catch (e) {
            console.error("[Bootstrap] History fetch error:", e);
            return [];
        }
    })();

    // 3. Recomendações / Fila Inicial (Motor de IA do backend)
    const initialQueuePromise = (async () => {
        try {
            // ETAPA 1: Obter o histórico já disparado em paralelo
            const userHistory = await historyPromise;
            
            // 🛡️ SHIELD CIRÚRGICO: Bloqueia APENAS dislikes e vistos-sem-voto.
            // Likes NÃO são bloqueados pois são as sementes de afinidade!
            const dislikedOrWatched = new Set(
              userHistory
                .filter(h => h.curtiu === false || (h.assistido === true && h.curtiu !== true))
                .map(h => Number(h.filme_id))
            );
            console.log(`[Bootstrap-Omni] Escudo cirúrgico ativado. ${dislikedOrWatched.size} deslikes/vistos bloqueados.`);

            // 🛡️ SELEÇÃO DE SEMENTES INTELIGENTE E PRIORITÁRIA (Focada em filmes marcados como assistidos/galeria)
            const watchedHistory = userHistory.filter(h => h.assistido === true);
            const likedHistory = userHistory.filter(h => h.curtiu === true);
            
            let watchedSeeds = [];
            if (watchedHistory.length > 0) {
                // Se houver filmes assistidos (galeria), eles são a prioridade absoluta!
                watchedSeeds = watchedHistory.sort(() => 0.5 - Math.random()).slice(0, 15);
                console.log(`[Bootstrap-Omni] Usando ${watchedSeeds.length} sementes baseadas em filmes assistidos da galeria.`);
            } else {
                // Fallback para curtidos/matches se a galeria estiver vazia
                watchedSeeds = likedHistory.sort(() => 0.5 - Math.random()).slice(0, 15);
                console.log(`[Bootstrap-Omni] Galeria vazia. Usando ${watchedSeeds.length} sementes baseadas em curtidos.`);
            }

            // ETAPA 2: Disparar motor baseado em filmes assistidos
            
            // MOTOR A: Afinidade Direta
            const runAffinity = async () => {
                if (watchedSeeds.length === 0) return [];
                const buckets = await Promise.all(watchedSeeds.map(async (s) => {
                    const [detPromise, recsPromise] = await Promise.all([
                        safeFetchTMDB(`movie/${s.filme_id}`),
                        safeFetchTMDB(`movie/${s.filme_id}/recommendations`, { page: 1 })
                    ]);
                    const title = detPromise.title || "Filme Assistido";
                    return (recsPromise.results || []).map(x => ({ ...x, _sourceTitle: title }));
                }));
                
                const maxLen = Math.max(...buckets.map(b => b.length));
                const mixed = [];
                for(let i=0; i<maxLen; i++) {
                    buckets.forEach(b => { if (b[i]) mixed.push(b[i]); });
                }
                return mixed;
            };

            const affinityRaw = await runAffinity();

            // ETAPA 3: Fusão com Filtragem Violenta
            const masterPool = [];
            const localDedupe = new Set();

            function safePush(movieObj, sourceTitle) {
                const mid = Number(movieObj.id);
                if (!mid) return;

                // REGRA CIRÚRGICA: Bloqueia DESLIKES/VISTOS SEM VOTO, e deduplica internamente.
                if (!dislikedOrWatched.has(mid) && !localDedupe.has(mid)) {
                    localDedupe.add(mid);
                    masterPool.push({ ...movieObj, _sourceTitle: sourceTitle });
                }
            }

            // PRIORIDADE MÁXIMA: Afinidade com filmes marcados como assistidos
            for (const a of affinityRaw) {
                safePush(a, a._sourceTitle);
            }

            // FALLBACK NEUTRO com rotação de página para evitar sempre os mesmos filmes (USUÁRIO NOVO)
            if (masterPool.length === 0) {
                const randPage = Math.floor(Math.random() * 5) + 1;
                const elite = await safeFetchTMDB('discover/movie', { sort_by: 'vote_count.desc', 'vote_average.gte': 7.2, without_genres: '16,10751', page: randPage });
                (elite.results || []).forEach(n => safePush(n, null));
            }

            // ETAPA 4: Enriquecimento Simultâneo
            const topSlice = masterPool.slice(0, 20);
            console.log(`[Bootstrap-Omni] Processando fat-payload para fila inicial de ${topSlice.length} cards.`);

            const enriched = await Promise.all(topSlice.map(async (item) => {
                const url = `https://api.themoviedb.org/3/movie/${item.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos`;
                try {
                    const r = await fetch(url);
                    if (!r.ok) return null;
                    const data = await r.json();
                    
                    let trailerKey = null;
                    const vids = data.videos?.results || [];
                    const best = vids.find(v => v.type === 'Trailer' && v.site === 'YouTube') || vids.find(v => v.site === 'YouTube');
                    if (best) trailerKey = best.key;

                    return {
                        ...data,
                        basedOnWatchedTitle: item._sourceTitle || null,
                        recommendationReason: item._sourceTitle ? "Com base no filme da sua galeria: " + item._sourceTitle : "Match Inteligente ML",
                        pre_fetched_trailer_key: trailerKey
                        // vibe_tags são geradas lazily pelo front-end via /api/vibe para não travar o Vercel
                    };
                } catch(e) { return null; }
            }));

            return enriched.filter(x => x && x.poster_path);
        } catch (e) {
            console.error("[Bootstrap-Omni] Critical Engine Failure:", e);
            return [];
        }
    })();

    // 4. Super Aggregate Trending/Destaques (Busca TODOS os subsets e notícias em paralelo)
    const trendingPromise = (async () => {
        try {
            const currentYear = new Date().getFullYear();
            const dateTo = new Date().toISOString().split('T')[0];
            const sixtyAgo = new Date();
            sixtyAgo.setDate(sixtyAgo.getDate() - 60);
            const sixtyAgoStr = sixtyAgo.toISOString().split('T')[0];
            
            const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
            const hallOfFameSeed = Math.floor(Date.now() / threeDaysMs);
            const hallOfFamePage = (hallOfFameSeed % 10) + 1;
            const releasePage = Math.floor(Math.random() * 2) + 1;

            // Executa 6 Chamadas TMDB e 1 Chamada Supabase REST simultaneamente!
            const [day, week, people, upcoming, awarded, newReleases, newsResp] = await Promise.all([
                safeFetchTMDB('discover/movie', { sort_by: 'popularity.desc', 'primary_release_date.gte': sixtyAgoStr, 'primary_release_date.lte': dateTo }),
                safeFetchTMDB('trending/movie/week'),
                safeFetchTMDB('trending/person/day'),
                safeFetchTMDB('movie/upcoming', { region: 'BR' }),
                safeFetchTMDB('discover/movie', { sort_by: 'vote_count.desc', 'vote_average.gte': 8, 'with_runtime.gte': 60, page: hallOfFamePage }),
                safeFetchTMDB('discover/movie', { primary_release_year: currentYear, sort_by: 'popularity.desc', page: releasePage }),
                (async () => {
                    try {
                        const nUrl = `${SUPABASE_URL}/rest/v1/news?select=*&order=published_at.desc&limit=40`;
                        const r = await fetch(nUrl, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
                        return r.ok ? await r.json() : [];
                    } catch (e) { return []; }
                })()
            ]);

            return {
                day: { results: day.results || [] },
                week: { results: week.results || [] },
                people: { results: people.results || [] },
                upcoming: { results: upcoming.results || [] },
                awarded: { results: awarded.results || [] },
                newReleases: { results: newReleases.results || [] },
                news: newsResp || []
            };
        } catch (e) {
            console.error("[Bootstrap] Trending aggregation error:", e);
            return { 
                day: { results: [] }, week: { results: [] }, upcoming: { results: [] }, 
                awarded: { results: [] }, newReleases: { results: [] }, news: [] 
            };
        }
    })();

    // RESOLVE TUDO EM PARALELO NA GIGABIT NETWORK DA VPS
    const [genresData, historyData, initialQueue, trendingData] = await Promise.all([
        genresPromise,
        historyPromise,
        initialQueuePromise,
        trendingPromise
    ]);

    console.timeEnd(`[Bootstrap] Execution for ${userId}`);

    // Entrega o Payload Ouro Consolidade
    return res.status(200).json({
        success: true,
        timestamp: Date.now(),
        data: {
            genres: genresData.genres || [],
            history: historyData || [],
            initialQueue: initialQueue || [],
            trending: trendingData
        }
    });

  } catch (error) {
    console.error('[Bootstrap] Critical failure:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

// ==============================================================================
// GERADOR DE VIBE TAGS (Chama Ollama na VPS com timeout seguro de 5s)
// ==============================================================================
async function generateVibeTagsBootstrap(title, overview) {
    try {
        const prompt = `Você é um crítico de cinema ultra-criativo. Analise o filme:
Título: "${title}"
Sinopse: "${(overview || '').slice(0, 400)}"

Gere exatamente 3 "Vibe Tags" curtas (2-5 palavras) e criativas que capturam a ESSÊNCIA emocional do filme.
Não use gêneros convencionais. Use linguagem humana e descontraída com emojis.

Exemplos: "Perfeito com pipoca 🍿", "Chorei demais 😭", "Trama explode a cabeça 🤯"

Responda APENAS com JSON array de 3 strings:
["tag1", "tag2", "tag3"]`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch('http://185.173.110.54:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'llama3.2', prompt, stream: false, options: { temperature: 0.85, num_predict: 80 } }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const d = await res.json();
        const raw = d.response || "";
        const match = raw.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
        if (!match) return null;
        const tags = JSON.parse(match[0]);
        return Array.isArray(tags) ? tags.slice(0, 3) : null;
    } catch (e) {
        return null; // Timeout ou falha silenciosa — não bloqueia o card
    }
}

