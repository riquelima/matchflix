const TMDB_API_KEY = "416394469462693ee5727abe4c864848";

export default async function handler(req, res) {
  // Configurar cabeçalhos CORS para permitir chamadas do frontend em produção
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    console.log('[Orchestrator] Chamando VPS Ollama Minimax...');
    
    const ollamaResponse = await fetch('http://185.173.110.54:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    if (!ollamaResponse.ok) {
      const errTxt = await ollamaResponse.text();
      throw new Error(`VPS Error: ${errTxt}`);
    }

    const ollamaData = await ollamaResponse.json();
    const rawText = ollamaData.response || "";

    console.log('[Orchestrator] Parsing da resposta bruta...');
    
    // Separação e Higienização igual à do frontend, mas rodando no server
    let textToShow = rawText;
    let titlesList = [];

    if (rawText.includes('|||')) {
      const parts = rawText.split('|||');
      textToShow = parts[0].trim();
      const jsonPart = parts[1] ? parts[1].trim() : '';
      titlesList = safeParseJSONList(jsonPart);
    } else {
      const bracketMatch = rawText.match(/\[\s*["'][\s\S]*?["']\s*\]/);
      if (bracketMatch) {
        const jsonPart = bracketMatch[0].trim();
        textToShow = rawText.replace(jsonPart, '').trim();
        titlesList = safeParseJSONList(jsonPart);
      }
    }

    console.log(`[Orchestrator] Encontrados ${titlesList.length} filmes sugeridos.`);
    
    // Limita a no máximo 10 filmes para garantir performance e respeitar UI
    const limitedTitles = titlesList.slice(0, 10);
    
    let enrichedMovies = [];
    if (limitedTitles.length > 0) {
      console.log('[Orchestrator] Iniciando pré-carregamento de alta velocidade via TMDB Server-side...');
      
      const fetchPromises = limitedTitles.map(async (rawTitle) => {
        try {
          // Tenta extrair Título e Ano, ex: "Interestelar (2014)"
          let query = rawTitle.trim();
          let year = "";
          const yearMatch = query.match(/\((\d{4})\)/);
          if (yearMatch) {
            year = yearMatch[1];
            query = query.replace(/\(\d{4}\)/, '').trim();
          }
          
          let url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(query)}&page=1&include_adult=false`;
          if (year) {
            url += `&primary_release_year=${year}`;
          }

          const tmdbRes = await fetch(url);
          if (!tmdbRes.ok) return null;
          const data = await tmdbRes.json();
          
          // Pega o primeiro resultado com poster e devolve.
          const match = data.results && data.results.find(m => m.poster_path);
          return match || (data.results ? data.results[0] : null);
        } catch (err) {
          console.error(`Erro na busca server-side para "${rawTitle}":`, err);
          return null;
        }
      });

      const rawResults = await Promise.all(fetchPromises);
      // Filtra os nulos e garante que tenham poster
      enrichedMovies = rawResults.filter(m => m && m.poster_path);
    }

    // Se depois de tudo não retornar nada, faz um fallback rápido no server para Trending
    if (enrichedMovies.length === 0) {
       console.log('[Orchestrator] Realizando fallback secundário: Trending Topics.');
       const trendRes = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=pt-BR&page=1`);
       if (trendRes.ok) {
         const data = await trendRes.json();
         enrichedMovies = (data.results || []).filter(m => m.poster_path).slice(0, 10);
       }
    }

    console.log(`[Orchestrator] Concluído com sucesso. Retornando ${enrichedMovies.length} filmes.`);
    
    // Retornamos um payload customizado pronto para renderização no frontend
    return res.status(200).json({
      success: true,
      text: textToShow,
      movies: enrichedMovies,
      originalResponse: rawText // para debug se necessário
    });

  } catch (error) {
    console.error('[Orchestrator] Erro Crítico no Handler:', error);
    return res.status(500).json({ error: 'Erro Interno do Servidor', details: error.message });
  }
}

// Utilitário de resiliência idêntico ao robust parser do frontend
function safeParseJSONList(rawStr) {
  let clean = rawStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  clean = clean.replace(/[“”]/g, '"').replace(/[‘’]/g, '"').replace(/'/g, '"');
  
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Recuperação por Regex robusto
    const regex = /"([^"\r\n]+)"/g;
    const list = [];
    let match;
    while ((match = regex.exec(clean)) !== null) {
      const val = match[1].trim();
      if (val && val !== '[' && val !== ']') {
        list.push(val);
      }
    }
    return list;
  }
}

