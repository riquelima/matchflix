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

  // Extrai userId da query
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: "Parâmetro 'userId' é obrigatório." });
  }

  console.log(`[ML-Engine] Solicitando recomendações híbridas para o usuário ${userId}`);

  try {
    // 1. Chama a função RPC inteligente no Supabase que calcula as correlações vetoriais
    const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
    
    const dbResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_limit: 15
      })
    });

    if (!dbResponse.ok) {
      const dbErr = await dbResponse.text();
      throw new Error(`Supabase RPC Error: ${dbErr}`);
    }

    const recommendations = await dbResponse.json();
    
    // Se o banco de dados for muito novo e não houver correlações ainda
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      console.log(`[ML-Engine] Nenhuma correlação encontrada para ${userId}. Retornando array vazio para acionar fallback local.`);
      return res.status(200).json({ success: true, source: 'ml-engine', movies: [] });
    }

    console.log(`[ML-Engine] Algoritmo encontrou ${recommendations.length} filmes correlacionados. Iniciando enriquecimento TMDB...`);

    // 2. Enriquecimento Simultâneo via Promise.all (Máxima Performance)
    const fetchPromises = recommendations.map(async (rec) => {
      try {
        const movieId = rec.recommended_movie_id;
        // FAT PAYLOAD: Trazemos vídeos e provedores na mesma chamada HTTP!
        const tmdbUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos,watch/providers`;
        const tRes = await fetch(tmdbUrl);
        if (!tRes.ok) return null;
        
        const movieData = await tRes.json();
        
        // Processamento do Trailer Server-Side (Lógica robusta)
        let trailerKey = null;
        const videos = movieData.videos?.results || [];
        if (videos.length > 0) {
            let video = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
            if (!video) video = videos.find(v => v.type === 'Teaser' && v.site === 'YouTube');
            if (!video) video = videos.find(v => v.site === 'YouTube');
            trailerKey = video ? video.key : null;
        }

        // Injetamos a "Gordura" útil pro frontend consumir instantaneamente
        return {
          ...movieData,
          recommendationReason: "Match Inteligente ML",
          ml_score: rec.similarity_score,
          pre_fetched_trailer_key: trailerKey // FAT KEY!
        };
      } catch (err) {
        console.error(`[ML-Engine] Falha ao buscar detalhes do filme ID ${rec.recommended_movie_id}:`, err);
        return null;
      }
    });

    const enrichedResults = await Promise.all(fetchPromises);
    
    // Filtra falhas e garante apenas filmes válidos com pôster
    const finalMovies = enrichedResults.filter(m => m && m.poster_path);

    console.log(`[ML-Engine] Enriquecimento concluído. Entregando ${finalMovies.length} filmes ao frontend.`);

    return res.status(200).json({
      success: true,
      source: 'ml-engine',
      movies: finalMovies
    });

  } catch (error) {
    // Logamos no backend servidor mas suprimimos no frontend (200 OK com lista vazia ativa o fallback visual do app)
    console.warn('[ML-Engine] Aviso: Erro interno ou RPC Mismatch na base de dados:', error.message);
    return res.status(200).json({ success: true, source: 'ml-fallback', movies: [], warning: "Database RPC schema mismatch prevented smart recommendation" });
  }
}
