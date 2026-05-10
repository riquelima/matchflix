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
            const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
            const dbResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({ p_user_id: userId, p_limit: 20 })
            });
            
            let recommendations = [];
            if (dbResponse.ok) {
                recommendations = await dbResponse.json();
            }

            // NOVO MECANISMO DE SEGURANÇA MÁXIMA: Se o ML falhar ou vier vazio, 
            // NÃO CAÍMOS MAIS NO BIAS GENÉRICO DE "POPULAR".
            // Nós analisamos o histórico real do usuário na hora e puxamos recomendações estruturais no TMDB!
            if (!Array.isArray(recommendations) || recommendations.length === 0) {
                console.log(`[ML-Engine] Fallback Inteligente Acionado para ${userId}. Aguardando histórico para extração de gosto...`);
                
                // 1. Pega o Histórico que já está sendo baixado na Promise paralela
                const userHistory = await historyPromise;
                const lastLiked = userHistory
                    .filter(h => h.curtiu === true)
                    .slice(0, 5); // Aumentamos para os 5 últimos likes reais para maior espectro
                
                let fallbackMovies = [];

                if (lastLiked.length > 0) {
                    console.log(`[ML-Engine] Extraindo sementes de afinidade de ${lastLiked.length} filmes do histórico.`);
                    // 2. Dispara Recomendações Cruzadas baseadas nos filmes específicos que o usuário gosta!
                    const simResults = await Promise.all(lastLiked.map(async (h) => {
                        const sourceDataPromise = safeFetchTMDB(`movie/${h.filme_id}`);
                        const dataPromise = safeFetchTMDB(`movie/${h.filme_id}/recommendations`, { page: 1 });
                        
                        const [sourceData, data] = await Promise.all([sourceDataPromise, dataPromise]);
                        const sourceTitle = sourceData.title || "filme salvo";
                        const results = data.results || [];
                        
                        return results.map(r => ({ ...r, _sourceTitle: sourceTitle }));
                    }));
                    
                    // Intercalar os resultados de diferentes sementes para maximizar a diversidade de gêneros instantaneamente
                    const maxLen = Math.max(...simResults.map(r => r.length));
                    const combined = [];
                    for (let i = 0; i < maxLen; i++) {
                        simResults.forEach(list => {
                            if (list[i]) combined.push(list[i]);
                        });
                    }

                    const uniqueMap = new Map();
                    combined.forEach(m => { if(m && m.id) uniqueMap.set(m.id, m); });
                    
                    // Filtra filmes já assistidos pelo usuário
                    const historyIds = new Set(userHistory.map(h => Number(h.filme_id)));
                    fallbackMovies = Array.from(uniqueMap.values())
                        .filter(m => !historyIds.has(Number(m.id)))
                        .slice(0, 30); // Retém um pool maior de 30 para mixar no front
                }

                // Se por acaso o usuário não tem histórico NENHUM (usuário zero), 
                // puxamos filmes com alta classificação, mas NÃO permitimos virar 'festa da aventura' genérica
                if (fallbackMovies.length === 0) {
                    console.log(`[ML-Engine] Usuário Virgem detectado. Usando filtro de elite global.`);
                    const elite = await safeFetchTMDB('discover/movie', { 
                        sort_by: 'vote_count.desc', 
                        'vote_average.gte': 7.5,
                        without_genres: '16', // Anti-animação por padrão pra iniciantes neutros
                        page: 1 
                    });
                    fallbackMovies = elite.results || [];
                }

                // Enriquecimento server-side idêntico ao fluxo ML
                const enrichedFallback = await Promise.all(fallbackMovies.slice(0, 15).map(async (movie) => {
                    const mUrl = `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos`;
                    try {
                        const r = await fetch(mUrl);
                        if (!r.ok) return null;
                        const movieData = await r.json();
                        
                        let trailerKey = null;
                        const v = movieData.videos?.results || [];
                        const trailer = v.find(x => x.type === 'Trailer' && x.site === 'YouTube') || v.find(x => x.site === 'YouTube');
                        if (trailer) trailerKey = trailer.key;

                        const source = movie._sourceTitle;
                        const finalReason = source ? `"${source}", baseado na sua Coleção Real` : "baseado na sua Coleção Real";

                        return {
                            ...movieData,
                            recommendationReason: finalReason,
                            pre_fetched_trailer_key: trailerKey
                        };
                    } catch (err) { return null; }
                }));
                
                return enrichedFallback.filter(x => x && x.poster_path);
            }

            // FLUXO NORMAL: Enriquecimento dos dados ML quando o algoritmo encontra correlações
            const enriched = await Promise.all(recommendations.slice(0, 15).map(async (rec) => {
                const mId = rec.recommended_movie_id;
                const mUrl = `https://api.themoviedb.org/3/movie/${mId}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos`;
                try {
                    const r = await fetch(mUrl);
                    if (!r.ok) return null;
                    const movieData = await r.json();
                    
                    let trailerKey = null;
                    const v = movieData.videos?.results || [];
                    const trailer = v.find(x => x.type === 'Trailer' && x.site === 'YouTube') || v.find(x => x.site === 'YouTube');
                    if (trailer) trailerKey = trailer.key;

                    return {
                        ...movieData,
                        recommendationReason: "Motor Inteligente na VPS",
                        pre_fetched_trailer_key: trailerKey
                    };
                } catch (err) { return null; }
            }));

            return enriched.filter(x => x && x.poster_path);
        } catch (e) {
            console.error("[Bootstrap] Critical queue failure:", e);
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
