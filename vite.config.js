import { defineConfig } from 'vite';
import { resolve } from 'path';
import sharp from 'sharp';

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
        
        // NOVO: Intercepta chamadas para /api/recommendations
        if (parsedUrl === '/api/recommendations') {
          console.log(`[Vite-ML-Engine] Solicitando recomendações locais para usuário via query.`);
          const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
          const userId = urlParams.get('userId');

          if (!userId) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'userId is required' }));
            return;
          }

          // Execução IIFE assíncrona para lidar com a requisição localmente
          (async () => {
            try {
              const SUPABASE_URL = "https://kewwqxfpjzrxduhoqfxw.supabase.co";
              const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtld3dxeGZwanpyeGR1aG9xZnh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NTY4MzEsImV4cCI6MjA5MjUzMjgzMX0.Ane5nDJf_4FjBDPEfiNWlKN3C7RAlEmk5pDlMMsxmZs";

              const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/get_ml_recommendations`;
              const dbRes = await fetch(rpcUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`
                },
                body: JSON.stringify({ p_user_id: userId, p_limit: 15 })
              });

              if (!dbRes.ok) {
                const errTxt = await dbRes.text();
                throw new Error(`RPC Error: ${errTxt}`);
              }

              const recommendations = await dbRes.json();
              
              if (!Array.isArray(recommendations) || recommendations.length === 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, movies: [] }));
                return;
              }

              console.log(`[Vite-ML-Engine] Encontrados ${recommendations.length} matches. Enriquecendo TMDB...`);

              const promises = recommendations.map(async (rec) => {
                try {
                  const tRes = await fetch(`https://api.themoviedb.org/3/movie/${rec.recommended_movie_id}?api_key=${TMDB_API_KEY}&language=pt-BR`);
                  if (!tRes.ok) return null;
                  const movieData = await tRes.json();
                  return { ...movieData, recommendationReason: "Match Inteligente ML", ml_score: rec.similarity_score };
                } catch(e) { return null; }
              });

              const finalMovies = (await Promise.all(promises)).filter(m => m && m.poster_path);
              
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, source: 'local-vite', movies: finalMovies }));
              
            } catch (err) {
              console.error('[Vite-ML-Engine] ERRO:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          })();
          
          return; // Finaliza o interceptador para esta rota
        }
        
        // NOVO: Intercepta chamadas para /api/movies (Data Orchestrator)
        if (parsedUrl === '/api/movies') {
          console.log(`[Vite-Data-Orchestrator] Proxy local acionado.`);
          const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
          const endpoint = urlParams.get('endpoint') || 'discover/movie';
          
          // Clona parâmetros omitindo 'endpoint' para repassar ao TMDB
          const queryMap = {};
          urlParams.forEach((val, key) => { if(key !== 'endpoint') queryMap[key] = val; });

          (async () => {
            try {
              const qs = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'pt-BR', ...queryMap }).toString();
              const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?${qs}`;
              
              const r = await fetch(tmdbUrl);
              const data = await r.json();
              const movies = data.results || [];

              if (movies.length === 0) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
                return;
              }

              // Enriquecimento Paralelo em Dev (igual produção)
              const subSlice = movies.slice(0, 15);
              const promises = subSlice.map(async (m) => {
                try {
                  const tr = await fetch(`https://api.themoviedb.org/3/movie/${m.id}?api_key=${TMDB_API_KEY}&language=pt-BR&append_to_response=videos`);
                  if (!tr.ok) return m;
                  const full = await tr.json();
                  let tk = null;
                  const v = full.videos?.results || [];
                  if (v.length > 0) {
                    const f = v.find(x => x.type === 'Trailer' && x.site === 'YouTube') || v.find(x => x.type === 'Teaser') || v[0];
                    tk = f ? f.key : null;
                  }
                  return { ...m, ...full, pre_fetched_trailer_key: tk };
                } catch(e) { return m; }
              });

              const enriched = await Promise.all(promises);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ...data, results: enriched }));

            } catch (err) {
              console.error('[Vite-Data-Orchestrator] ERRO:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          })();
          return;
        }
        
        // NOVO: Intercepta chamadas para /api/hydrator (Batch Multi-Movie Hydrator)
        if (parsedUrl === '/api/hydrator') {
          console.log(`[Vite-Hydrator] Simulador de Hidratação em Lote.`);
          const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
          const idsStr = urlParams.get('ids') || '';
          const ids = idsStr.split(',').map(s => s.trim()).filter(Boolean);

          (async () => {
            try {
              const promises = ids.map(async (id) => {
                try {
                  const r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}&language=pt-BR`);
                  return r.ok ? await r.json() : null;
                } catch(e) { return null; }
              });
              const movies = (await Promise.all(promises)).filter(Boolean);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(movies));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify([]));
            }
          })();
          return;
        }
        
        // NOVO: Intercepta chamadas para /api/image (Edge Image Optimizer Simulator)
        if (parsedUrl === '/api/image') {
          const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
          const pathArg = urlParams.get('path');
          let widthArg = parseInt(urlParams.get('w') || '500', 10);

          if (!pathArg) {
            res.writeHead(400);
            res.end("Missing path param");
            return;
          }

          (async () => {
            try {
              const target = `https://image.tmdb.org/t/p/original${pathArg.startsWith('/') ? '' : '/'}${pathArg}`;
              const imgReq = await fetch(target);
              if (!imgReq.ok) throw new Error("Failed orig");
              const buf = await imgReq.arrayBuffer();
              
              const optimized = await sharp(Buffer.from(buf))
                .resize(widthArg, null, { withoutEnlargement: true })
                .webp({ quality: 80 })
                .toBuffer();
              
              res.writeHead(200, { 
                'Content-Type': 'image/webp',
                'Cache-Control': 'max-age=3600' 
              });
              res.end(optimized);
            } catch(e) {
              // Fallback instantâneo direto pro TMDB JPG para não quebrar Dev
              res.writeHead(307, { 'Location': `https://image.tmdb.org/t/p/w${widthArg}${pathArg}` });
              res.end();
            }
          })();
          return;
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
