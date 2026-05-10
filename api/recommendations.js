const TMDB_API_KEY = "416394469462693ee5727abe4c864848";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://kewwqxfpjzrxduhoqfxw.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";

export default async function handler(req, res) {
  // Cabeçalhos CORS Mandatórios
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Parâmetro 'userId' é obrigatório." });
  }

  console.log(`[OMNI-Engine] Iniciando pipeline de recomendação ultra-filtrada para ${userId}`);

  // Helper central de fetch
  async function safeFetchTMDB(endpoint, params = {}) {
    try {
      const query = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'pt-BR', ...params });
      const url = `https://api.themoviedb.org/3/${endpoint}?${query.toString()}`;
      const resp = await fetch(url);
      if (!resp.ok) return { results: [] };
      return await resp.json();
    } catch (e) { return { results: [] }; }
  }

  try {
    // ==============================================================================
    // PASSO 1: OBTENÇÃO DO HISTÓRICO REAL DO USUÁRIO (MANDATÓRIO E IMEDIATO)
    // ==============================================================================
    const histUrl = `${SUPABASE_URL}/rest/v1/curtidas_filmes?usuario_id=eq.${userId}&select=filme_id,assistido,curtiu&order=criado_em.desc&limit=3000`;
    const histResp = await fetch(histUrl, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const userHistory = histResp.ok ? await histResp.json() : [];

    // 🛡️ ESCUDO ABSOLUTO CONTRA REPETIÇÃO E DESLIKES
    // Pegamos TODOS os IDs com os quais o usuário já interagiu (curtiu, não curtiu ou assistiu).
    const seenIds = new Set(userHistory.map(h => Number(h.filme_id)));
    console.log(`[OMNI-Engine] Proteção ativada. ${seenIds.size} filmes bloqueados para evitar repetição/deslike.`);

    // Pegamos as sementes para afinidade (likes reais)
    const likedSeeds = userHistory.filter(h => h.curtiu === true).slice(0, 6);

    // ==============================================================================
    // PASSO 2: DISPARO PARALELO DOS DOIS MOTORES DE BUSCA
    // ==============================================================================
    
    // MOTOR A: Afinidade Direta (Garante a personalização exata e as Tags pedidas)
    const runAffinityEngine = async () => {
        if (likedSeeds.length === 0) return [];
        console.log(`[OMNI-Engine] Rodando Motor de Afinidade sobre ${likedSeeds.length} sementes...`);

        const fetchBuckets = await Promise.all(likedSeeds.map(async (s) => {
            const detailsPromise = safeFetchTMDB(`movie/${s.filme_id}`);
            const recsPromise = safeFetchTMDB(`movie/${s.filme_id}/recommendations`, { page: 1 });
            
            const [det, rec] = await Promise.all([detailsPromise, recsPromise]);
            const movieTitle = det.title || "Filme Salvo";
            const recList = rec.results || [];

            // Vinculamos o título original ao objeto para renderizar a Tag perfeitamente
            return recList.map(movie => ({ ...movie, _sourceTitle: movieTitle }));
        }));

        // Intercalamos os baldes para máxima variabilidade (não saturar um gênero)
        const maxLen = Math.max(...fetchBuckets.map(b => b.length));
        const mixedList = [];
        for (let i = 0; i < maxLen; i++) {
            fetchBuckets.forEach(b => { if (b[i]) mixedList.push(b[i]); });
        }
        return mixedList;
    };

    // MOTOR B: RPC Inteligente no Postgres (Executa em paralelo como reforço)
    const runRPCEngine = async () => {
        try {
            const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
            const r = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({ p_user_id: userId, p_limit: 30 })
            });
            return r.ok ? await r.json() : [];
        } catch (e) { return []; }
    };

    // Executa ambos e aguarda conclusão
    const [affinityRaw, rpcRaw] = await Promise.all([runAffinityEngine(), runRPCEngine()]);

    // ==============================================================================
    // PASSO 3: FILTRAGEM CRUZADA AGRESSIVA E MERGE DE DADOS
    // ==============================================================================
    const combinedPool = [];
    const deduplicationTracker = new Set(); // Garante que não adicionamos o mesmo filme 2x no mesmo response

    // Função utilitária para empurrar no pool final respeitando o SHIELD
    function safePushToPool(movieObj, sourceLabel) {
        const mId = Number(movieObj.id);
        if (!mId) return;

        // CRÍTICO: Impede EXIBIR o que já foi visto/descurtido E impede duplicata interna
        if (!seenIds.has(mId) && !deduplicationTracker.has(mId)) {
            deduplicationTracker.add(mId);
            combinedPool.push({
                ...movieObj,
                _finalReason: sourceLabel
            });
        }
    }

    // 3.1 INJETAMOS A PRIORIDADE 1: Afinidade (Onde estão as TAGS que o user quer!)
    for (const mov of affinityRaw) {
        const tag = mov._sourceTitle ? `"${mov._sourceTitle}", baseado na sua Coleção Real` : "baseado na sua Coleção Real";
        safePushToPool(mov, tag);
    }

    // 3.2 INJETAMOS A PRIORIDADE 2: RPC (Preenche as lacunas se houver espaço)
    // Como o RPC devolve { recommended_movie_id, ... }, convertemos o ID
    for (const rec of rpcRaw) {
        const converted = { id: rec.recommended_movie_id };
        safePushToPool(converted, "baseado na sua Coleção Real"); // Usamos a tag genérica padrão solicitada para uniformidade
    }

    // FALLBACK DE EMERGÊNCIA (Se nada restou pós-filtro, ou usuário totalmente novo)
    if (combinedPool.length === 0) {
        console.log("[OMNI-Engine] Pool vazio após filtragem. Acionando fallback Elite.");
        const neutral = await safeFetchTMDB('discover/movie', { 
            sort_by: 'vote_count.desc', 
            'vote_average.gte': 7.8, 
            without_genres: '16,10751',
            page: 1 
        });
        (neutral.results || []).forEach(n => safePushToPool(n, "baseado na sua Coleção Real"));
    }

    // ==============================================================================
    // PASSO 4: ENRIQUECIMENTO FAT-PAYLOAD PARALELO (TRAILERS, ETC)
    // ==============================================================================
    // Limitamos ao TOP 25 do pool combinado para garantir latência baixa e alta qualidade.
    const finalSlice = combinedPool.slice(0, 25);
    console.log(`[OMNI-Engine] Processando fat-payload para ${finalSlice.length} filmes finais.`);

    const enrichedResult = await Promise.all(finalSlice.map(async (item) => {
        try {
            const deepUrl = `https://api.themoviedb.org/3/movie/${item.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos,watch/providers`;
            const r = await fetch(deepUrl);
            if (!r.ok) return null;
            const data = await r.json();

            let trailerKey = null;
            const videos = data.videos?.results || [];
            const chosen = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube') || videos.find(v => v.site === 'YouTube');
            if (chosen) trailerKey = chosen.key;

            return {
                ...data,
                recommendationReason: item._finalReason,
                pre_fetched_trailer_key: trailerKey
            };
        } catch(e) { return null; }
    }));

    const outputData = enrichedResult.filter(x => x && x.poster_path);
    console.log(`[OMNI-Engine] Ciclo completo. Entregando ${outputData.length} filmes refinados.`);

    return res.status(200).json({
        success: true,
        source: 'omni-engine-v2',
        movies: outputData
    });

  } catch (error) {
    console.error("[OMNI-Engine] FALHA CRÍTICA NO PROCESSO:", error);
    return res.status(200).json({ success: true, movies: [], error: "Pipeline general failure" });
  }
}
