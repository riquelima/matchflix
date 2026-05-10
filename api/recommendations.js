const TMDB_API_KEY = "416394469462693ee5727abe4c864848";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kewwqxfpjzrxduhoqfxw.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";

export default async function handler(req, res) {
  // Cabeçalhos CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Parâmetro 'userId' é obrigatório." });
  }

  console.log(`[ML-Engine] Solicitando recomendações robustas para o usuário ${userId}`);

  // Helper local para TMDB
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

  try {
    // ESTRATÉGIA 1: Tentar o Motor Inteligente de Vetores no Supabase RPC
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
    
    let recommendations = [];
    try {
        const dbResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
          },
          body: JSON.stringify({ p_user_id: userId, p_limit: 20 })
        });
        if (dbResponse.ok) {
            recommendations = await dbResponse.json();
        }
    } catch (err) {
        console.warn("[ML-Engine] RPC INDISPONÍVEL. Escalonando para o Fallback de Afinidade.");
    }

    // Se o RPC retornou dados, segue o enriquecimento padrão do ML.
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      console.log(`[ML-Engine] RPC entregou ${recommendations.length} filmes. Iniciando Enriquecimento.`);
      const finalMovies = await enrichDefaultRecommendations(recommendations, "Match Inteligente ML");
      return res.status(200).json({ success: true, source: 'ml-rpc', movies: finalMovies });
    }

    // ==========================================================================
    // ESTRATÉGIA 2 (NOVA): MOTOR DE AFINIDADE BASEADO NA COLEÇÃO REAL DO USUÁRIO
    // ==========================================================================
    console.log(`[ML-Engine] Acionando Motor de Afinidade Contextual para ${userId}`);

    // 1. Puxar histórico direto no Supabase REST
    const histUrl = `${SUPABASE_URL}/rest/v1/curtidas_filmes?usuario_id=eq.${userId}&select=filme_id,assistido,curtiu&order=criado_em.desc&limit=500`;
    const histResp = await fetch(histUrl, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const userHistory = histResp.ok ? await histResp.json() : [];
    
    // Pega as últimas 5 curtidas (representam a Coleção Real)
    const lastLiked = userHistory.filter(h => h.curtiu === true).slice(0, 5);

    let poolMovies = [];

    if (lastLiked.length > 0) {
        console.log(`[ML-Engine] Extraindo afinidades de ${lastLiked.length} filmes curtidos...`);
        
        // 2. Paralelismo: Busca o título do filme semente e as recomendações dele
        const simResults = await Promise.all(lastLiked.map(async (h) => {
            const sourcePromise = safeFetchTMDB(`movie/${h.filme_id}`);
            const recPromise = safeFetchTMDB(`movie/${h.filme_id}/recommendations`, { page: 1 });
            
            const [sourceData, recData] = await Promise.all([sourcePromise, recPromise]);
            const title = sourceData.title || "Filme Salvo";
            const recs = recData.results || [];
            
            // Vincula a semente de origem no filme recomendado
            return recs.map(r => ({ ...r, _sourceTitle: title }));
        }));

        // 3. Algoritmo de Intercalação (Interleaving) para MIXAR as recomendações e não saturar
        const maxLen = Math.max(...simResults.map(arr => arr.length));
        const mixedArray = [];
        for (let i = 0; i < maxLen; i++) {
            simResults.forEach(bucket => {
                if (bucket[i]) mixedArray.push(bucket[i]);
            });
        }

        // Remove duplicatas e filtra o que o usuário já interagiu
        const seen = new Set(userHistory.map(h => Number(h.filme_id)));
        const uniqueMap = new Map();
        mixedArray.forEach(m => {
            if (m && m.id && !seen.has(Number(m.id))) uniqueMap.set(m.id, m);
        });

        poolMovies = Array.from(uniqueMap.values()).slice(0, 25);
    }

    // Fallback Neutro Seguro para Usuários Sem Histórico
    if (poolMovies.length === 0) {
        console.log(`[ML-Engine] Nenhuma afinidade disponível. Disparando Neutro de Alta Qualidade.`);
        const neutral = await safeFetchTMDB('discover/movie', { 
            sort_by: 'vote_count.desc', 
            'vote_average.gte': 7.8, 
            without_genres: '16,10751', // Sem animação/família por padrão no neutro
            page: 1 
        });
        poolMovies = (neutral.results || []).slice(0, 20);
    }

    // 4. Enriquecimento Turbo (Puxa Trailer e Metadata Profunda para o Front)
    const enrichedFallback = await Promise.all(poolMovies.map(async (movie) => {
        try {
            const fullUrl = `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos,watch/providers`;
            const resD = await fetch(fullUrl);
            if (!resD.ok) return null;
            const data = await resD.json();

            let tKey = null;
            const vArr = data.videos?.results || [];
            const trailer = vArr.find(v => v.type === 'Trailer' && v.site === 'YouTube') || vArr.find(v => v.site === 'YouTube');
            if (trailer) tKey = trailer.key;

            const seed = movie._sourceTitle;
            const dynamicReason = seed ? `"${seed}", baseado na sua Coleção Real` : "baseado na sua Coleção Real";

            return {
                ...data,
                recommendationReason: dynamicReason,
                pre_fetched_trailer_key: tKey
            };
        } catch (e) { return null; }
    }));

    const finalOutput = enrichedFallback.filter(x => x && x.poster_path);
    console.log(`[ML-Engine] Entregando ${finalOutput.length} filmes customizados baseados na coleção.`);

    return res.status(200).json({
        success: true,
        source: 'ml-collection-affinity',
        movies: finalOutput
    });

  } catch (error) {
    console.error('[ML-Engine] ERRO CRÍTICO:', error);
    return res.status(200).json({ success: true, movies: [], error: "Unexpected error prevented dynamic recommendations" });
  }

  // Função Auxiliar para Enriquecer o RPC
  async function enrichDefaultRecommendations(recs, defaultLabel) {
      const fetchPromises = recs.map(async (rec) => {
          try {
            const mId = rec.recommended_movie_id;
            const u = `https://api.themoviedb.org/3/movie/${mId}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos,watch/providers`;
            const r = await fetch(u);
            if (!r.ok) return null;
            const md = await r.json();
            
            let tk = null;
            const v = md.videos?.results || [];
            const vid = v.find(x => x.type === 'Trailer' && x.site === 'YouTube') || v.find(x => x.site === 'YouTube');
            if (vid) tk = vid.key;

            return {
                ...md,
                recommendationReason: defaultLabel,
                ml_score: rec.similarity_score,
                pre_fetched_trailer_key: tk
            };
          } catch (e) { return null; }
      });
      const results = await Promise.all(fetchPromises);
      return results.filter(m => m && m.poster_path);
  }
}
