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

  console.log(`[OMNI-Engine V3] Iniciando pipeline de recomendação para ${userId}`);

  // Helper central de fetch TMDB
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
    // PASSO 1: HISTÓRICO COMPLETO — Obrigamos buscar 3000 registros antes de tudo
    // ==============================================================================
    const histUrl = `${SUPABASE_URL}/rest/v1/curtidas_filmes?usuario_id=eq.${userId}&select=filme_id,assistido,curtiu&order=criado_em.desc&limit=3000`;
    const histResp = await fetch(histUrl, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const userHistory = histResp.ok ? await histResp.json() : [];

    // 🛡️ SHIELD CIRÚRGICO (apenas dislikes e neutros bloqueiam — likes NÃO bloqueiam pois são as sementes!)
    // Filmes com curtiu = false foram explicitamente rejeitados → bloqueamos para sempre
    // Filmes com curtiu = true são a COLEÇÃO REAL → usamos como sementes, não como bloqueio
    // Filmes com assistido = true, curtiu = null → foram assistidos mas sem voto → bloqueamos para não repetir
    const dislikedOrWatched = new Set(
      userHistory
        .filter(h => h.curtiu === false || (h.assistido === true && h.curtiu !== true))
        .map(h => Number(h.filme_id))
    );

    // IDs de tudo já interagido para evitar repetição na MESMA carga (inclui likes para dedup interno)
    const allInteractedIds = new Set(userHistory.map(h => Number(h.filme_id)));

    const likedHistory = userHistory.filter(h => h.curtiu === true);
    // Embaralha as sementes para que cada requisição traga recomendações dinâmicas e infinitas baseadas em curtidos diferentes
    const watchedSeeds = likedHistory.sort(() => 0.5 - Math.random()).slice(0, 15);

    console.log(`[OMNI-Engine V3] Shield cirúrgico: ${dislikedOrWatched.size} bloqueados (deslikes+vistos). ${watchedSeeds.length} sementes de curtidos prontas.`);

    // ==============================================================================
    // PASSO 2: MOTOR DE AFINIDADE BASEADO EM FILMES ASSISTIDOS
    // ==============================================================================
    
    // Afinidade Direta — Usa filmes ASSISTIDOS como sementes e busca similares no TMDB
    const runAffinity = async () => {
        if (watchedSeeds.length === 0) return [];
        const buckets = await Promise.all(watchedSeeds.map(async (s) => {
            const [det, rec] = await Promise.all([
                safeFetchTMDB(`movie/${s.filme_id}`),
                safeFetchTMDB(`movie/${s.filme_id}/recommendations`, { page: 1 })
            ]);
            const title = det.title || "Filme Assistido";
            return (rec.results || []).map(movie => ({ ...movie, _sourceTitle: title }));
        }));
        
        // Interleave para diversidade de gêneros e origens
        const maxLen = Math.max(0, ...buckets.map(b => b.length));
        const mixed = [];
        for (let i = 0; i < maxLen; i++) {
            buckets.forEach(b => { if (b[i]) mixed.push(b[i]); });
        }
        return mixed;
    };

    const affinityRaw = await runAffinity();

    // ==============================================================================
    // PASSO 3: FUSÃO COM FILTRAGEM CIRÚRGICA
    // ==============================================================================
    const masterPool = [];
    const localDedupe = new Set(); // Anti-duplicata intra-request

    function safePush(movieObj, sourceTitle) {
        const mid = Number(movieObj.id);
        if (!mid) return;

        // REGRA: Bloqueia DESLIKES e VISTOS SEM VOTO, mas deixa novas sugestões passarem.
        if (!dislikedOrWatched.has(mid) && !localDedupe.has(mid)) {
            localDedupe.add(mid);
            masterPool.push({ ...movieObj, _sourceTitle: sourceTitle });
        }
    }

    // PRIORIDADE: Afinidade direta com filmes marcados como assistidos
    for (const a of affinityRaw) {
        safePush(a, a._sourceTitle);
    }

    // FALLBACK DE SEGURANÇA (NOVO USUÁRIO): Se após tudo isso o pool ainda estiver vazio, busca filmes famosos de alta qualidade
    if (masterPool.length === 0) {
        console.log("[OMNI-Engine V3] Usuário Novo ou Sem Filmes Assistidos. Carregando sugestões de filmes famosos.");
        const randomPage = Math.floor(Math.random() * 5) + 1; // Rotaciona para evitar repetição
        const neutral = await safeFetchTMDB('discover/movie', { 
            sort_by: 'vote_count.desc', 
            'vote_average.gte': 7.2, 
            without_genres: '16,10751',
            page: randomPage
        });
        (neutral.results || []).forEach(n => safePush(n, null));
    }

    // ==============================================================================
    // PASSO 4: ENRIQUECIMENTO FAT-PAYLOAD COM VIBE TAGS IA (em paralelo!)
    // ==============================================================================
    const topSlice = masterPool.slice(0, 20);
    console.log(`[OMNI-Engine V3] Enriquecendo ${topSlice.length} filmes com fat-payload + Vibe Tags.`);

    const enrichedResult = await Promise.all(topSlice.map(async (item) => {
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
                basedOnWatchedTitle: item._sourceTitle || null,
                recommendationReason: item._sourceTitle ? "Com base no filme da sua galeria: " + item._sourceTitle : "Match Inteligente ML",
                pre_fetched_trailer_key: trailerKey
                // vibe_tags são geradas lazily pelo front-end via /api/vibe para não travar o Vercel
            };
        } catch(e) { return null; }
    }));

    const outputData = enrichedResult.filter(x => x && x.poster_path);
    console.log(`[OMNI-Engine V3] Ciclo completo. Entregando ${outputData.length} filmes refinados com Vibe Tags.`);

    return res.status(200).json({
        success: true,
        source: 'omni-engine-v3',
        movies: outputData
    });

  } catch (error) {
    console.error("[OMNI-Engine V3] FALHA CRÍTICA:", error);
    return res.status(200).json({ success: true, movies: [], error: "Pipeline general failure" });
  }
}

// ==============================================================================
// GERADOR DE VIBE TAGS (Chama Ollama na VPS com timeout seguro)
// ==============================================================================
async function generateVibeTags(title, overview) {
    try {
        const prompt = `Você é um crítico de cinema ultra-criativo e divertido. Analise este filme:

Título: "${title}"
Sinopse: "${overview.slice(0, 500)}"

Gere exatamente 3 "Vibe Tags" criativas e humanas (não os gêneros convencionais como "Ação" ou "Drama").
As tags devem ser curtas (2-5 palavras), divertidas e capturar a ESSÊNCIA emocional do filme.

Exemplos de boas tags:
- "Perfeito com pipoca 🍿"
- "Chorei demais 😭"
- "Trama explode a cabeça 🤯"
- "Assista à noite 🌙"
- "Família vai adorar 👨‍👩‍👧"
- "Adrenalina total ⚡"

Responda APENAS com um JSON array de 3 strings, sem mais nada:
["tag1", "tag2", "tag3"]`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5s para não travar o request

        const ollamaRes = await fetch('http://185.173.110.54:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                prompt,
                stream: false,
                options: { temperature: 0.9, num_predict: 100 }
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!ollamaRes.ok) return null;
        const ollamaData = await ollamaRes.json();
        const rawText = ollamaData.response || "";

        // Parser robusto para extrair array JSON
        const jsonMatch = rawText.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
        if (!jsonMatch) return null;
        
        const tags = JSON.parse(jsonMatch[0]);
        return Array.isArray(tags) ? tags.slice(0, 3) : null;
    } catch (e) {
        // Timeout ou falha na VPS → não bloqueia o card, apenas não adiciona as tags
        return null;
    }
}
