import { defineConfig } from 'vite';
import { resolve } from 'path';

const TMDB_API_KEY = "416394469462693ee5727abe4c864848";

// Plugin personalizado para orquestrar chamadas à IA e TMDB no ambiente de Desenvolvimento
function viteAiOrchestratorPlugin() {
  return {
    name: 'vite-plugin-ai-orchestrator',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Intercepta qualquer chamada para /api/generate, seja POST, com querystring ou sem
        const parsedUrl = req.url.split('?')[0];
        
        if (parsedUrl === '/api/generate') {
          console.log(`[Vite-Orchestrator] Recebido request ${req.method} para ${req.url}`);
          
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const reqBody = JSON.parse(body);
              
              console.log('[Vite-Orchestrator] Chamando VPS Minimax...');
              const ollamaRes = await fetch('http://185.173.110.54:11434/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
              });
              
              const ollamaData = await ollamaRes.json();
              const rawText = ollamaData.response || "";
              
              // 1. Extração de Títulos do Texto
              let textToShow = rawText;
              let titlesList = [];
              if (rawText.includes('|||')) {
                const parts = rawText.split('|||');
                textToShow = parts[0].trim();
                titlesList = safeParseJSONList(parts[1] ? parts[1].trim() : '');
              } else {
                const match = rawText.match(/\[\s*["'][\s\S]*?["']\s*\]/);
                if (match) {
                  textToShow = rawText.replace(match[0], '').trim();
                  titlesList = safeParseJSONList(match[0]);
                }
              }

              const limited = titlesList.slice(0, 10);
              let movies = [];

              // 2. Busca de Posters Paralela na API TMDB
              if (limited.length > 0) {
                console.log(`[Vite-Orchestrator] Buscando ${limited.length} títulos no TMDB...`);
                const promises = limited.map(async (rawTitle) => {
                  try {
                    let q = rawTitle.trim();
                    let y = "";
                    const ym = q.match(/\((\d{4})\)/);
                    if (ym) {
                      y = ym[1];
                      q = q.replace(/\(\d{4}\)/, '').trim();
                    }
                    
                    let url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&language=pt-BR&query=${encodeURIComponent(q)}&page=1`;
                    if (y) url += `&primary_release_year=${y}`;
                    
                    const r = await fetch(url);
                    const d = await r.json();
                    // Prioriza resultados com pôster
                    return (d.results || []).find(m => m.poster_path) || (d.results ? d.results[0] : null);
                  } catch (e) {
                    return null;
                  }
                });
                movies = (await Promise.all(promises)).filter(m => m && m.poster_path);
              }

              // Fallback se nada foi encontrado
              if (movies.length === 0) {
                console.log('[Vite-Orchestrator] Carregando Trending como fallback...');
                const r = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=pt-BR`);
                const d = await r.json();
                movies = (d.results || []).filter(m => m.poster_path).slice(0, 10);
              }

              console.log(`[Vite-Orchestrator] Sucesso! Retornando texto + ${movies.length} filmes.`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, text: textToShow, movies }));
            } catch (err) {
              console.error('[Vite-Orchestrator] ERRO:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return; // Encerra o middleware para não cair em 404
        }
        
        next(); // Passa para o próximo middleware do Vite para requisições normais
      });
    }
  };
}

function safeParseJSONList(str) {
  let c = str.replace(/```json/gi, '').replace(/```/g, '').trim().replace(/[“”‘’]/g, '"').replace(/'/g, '"');
  try { return JSON.parse(c); } catch (e) {
    const list = [];
    let m;
    const r = /"([^"\r\n]+)"/g;
    while ((m = r.exec(c)) !== null) {
      if (m[1].trim() && m[1] !== '[' && m[1] !== ']') list.push(m[1].trim());
    }
    return list;
  }
}

export default defineConfig({
  plugins: [viteAiOrchestratorPlugin()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        cadastro: resolve(__dirname, 'cadastro.html'),
        primeiroLogin: resolve(__dirname, 'primeiroLogin.html'),
        selecaoGeneros: resolve(__dirname, 'selecaoGeneros.html'),
        descobrir: resolve(__dirname, 'descobrir.html'),
        meusmatches: resolve(__dirname, 'meusmatches.html'),
        colecoes: resolve(__dirname, 'colecoes.html'),
        configuracoes: resolve(__dirname, 'configuracoes.html'),
      }
    }
  }
});
