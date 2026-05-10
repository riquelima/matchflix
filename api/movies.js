const TMDB_API_KEY = "416394469462693ee5727abe4c864848";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { endpoint = 'discover/movie', ...queryParams } = req.query;

  try {
    console.log(`[Data-Orchestrator] Recebido pedido para endpoint: ${endpoint}`);
    
    // 1. Reconstrói a URL original da API TMDB a partir das queries repassadas
    const qs = new URLSearchParams({
      api_key: TMDB_API_KEY,
      language: 'pt-BR',
      ...queryParams
    }).toString();

    const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${qs}`;
    
    const initialRes = await fetch(tmdbUrl);
    if (!initialRes.ok) {
      const errTxt = await initialRes.text();
      throw new Error(`TMDB API Error: ${errTxt}`);
    }
    
    const rawData = await initialRes.json();
    const rawMovies = rawData.results || [];
    
    if (rawMovies.length === 0) {
       return res.status(200).json({ ...rawData, results: [] });
    }

    console.log(`[Data-Orchestrator] Encontrados ${rawMovies.length} filmes básicos. Iniciando Enriquecimento Concorrente (FAT Payload)...`);

    // 2. PARALELISMO MÁXIMO: Em paralelo, rodamos um request profundo por filme para pegar os vídeos!
    // Limitaremos aos primeiros 20 para garantir latência super baixa e estabilidade de rede.
    const limitMovies = rawMovies.slice(0, 20);

    const enrichPromises = limitMovies.map(async (baseMovie) => {
        try {
            // FAT CALL: append_to_response traz a metadata completa
            const deepUrl = `https://api.themoviedb.org/3/movie/${baseMovie.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos,watch/providers`;
            const deepRes = await fetch(deepUrl);
            if (!deepRes.ok) return baseMovie; // Em caso de erro, devolve ao menos o dado base para não perder o card
            
            const fullData = await deepRes.json();

            // Garimpar o trailer Key da montanha de dados no server
            let trailerKey = null;
            const videos = fullData.videos?.results || [];
            if (videos.length > 0) {
                let v = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                if (!v) v = videos.find(v => v.type === 'Teaser' && v.site === 'YouTube');
                if (!v) v = videos.find(v => v.site === 'YouTube');
                trailerKey = v ? v.key : null;
            }

            // Junta os dados: Mantém os originais da listagem e injeta os profundos úteis
            return {
                ...baseMovie,
                ...fullData, // Funde com os dados completos (runtime, etc)
                pre_fetched_trailer_key: trailerKey // A Joia do "Fat Payload"
            };

        } catch (err) {
            console.warn(`[Data-Orchestrator] Falha pontual ao enriquecer ${baseMovie.id}, usando fallback base.`);
            return baseMovie;
        }
    });

    const enrichedMovies = await Promise.all(enrichPromises);

    console.log(`[Data-Orchestrator] Processamento CONCLUÍDO. Retornando fat-payload para o front.`);

    // Devolve o objeto no exato formato que o frontend já espera, mas com dados super-vitaminados
    return res.status(200).json({
        ...rawData,
        results: enrichedMovies
    });

  } catch (error) {
    console.error('[Data-Orchestrator] ERRO FATAL NO PROXY:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
