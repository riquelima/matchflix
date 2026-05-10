const TMDB_API_KEY = "416394469462693ee5727abe4c864848";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { ids } = req.query;
    if (!ids) {
        return res.status(200).json([]);
    }

    // Converte string de IDs comma-separated em Array e limita a 100 por requisição para evitar timeouts
    const idArray = ids.split(',')
        .map(id => id.trim())
        .filter(id => id && !isNaN(id))
        .slice(0, 100);

    if (idArray.length === 0) {
        return res.status(200).json([]);
    }

    console.log(`[Hydrator] Iniciando hidratação em lote de ${idArray.length} filmes na VPS.`);

    // Paralelismo extremo no backbone de internet do datacenter
    const fetchPromises = idArray.map(async (movieId) => {
        try {
            const url = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${TMDB_API_KEY}&language=pt-BR`;
            const response = await fetch(url);
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error(`[Hydrator] Falha ao buscar filme ${movieId}:`, error.message);
            return null;
        }
    });

    const results = await Promise.all(fetchPromises);
    
    // Filtra falhas para entregar apenas o ouro limpo
    const validMovies = results.filter(movie => movie !== null);

    console.log(`[Hydrator] Sucesso! ${validMovies.length}/${idArray.length} hidratados e prontos.`);

    return res.status(200).json(validMovies);

  } catch (error) {
    console.error('[Hydrator] Erro crítico:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
