// /api/vibe.js — Gerador de Vibe Tags por IA
// Chamado pelo front-end de forma lazy (apenas para o card ativo no topo da pilha)
// Arquitetura: Frontend → /api/vibe → VPS Ollama → retorna 3 tags JSON

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Aceita tanto GET (?title=...&overview=...) quanto POST ({ title, overview })
  const { title, overview } = req.method === 'POST' ? req.body : req.query;

  if (!title || !overview) {
    return res.status(400).json({ error: "title e overview são obrigatórios." });
  }

  console.log(`[Vibe-AI] Gerando tags para: "${title}"`);

  const prompt = `Você é um crítico de cinema ultra-criativo e divertido escrevendo em português do Brasil.

Analise este filme:
Título: "${title}"
Sinopse: "${String(overview).slice(0, 500)}"

Gere exatamente 3 "Vibe Tags" em português brasileiro — rótulos criativos e humanos (não os gêneros convencionais como "Ação" ou "Drama").
As tags devem ser curtas (2-5 palavras), divertidas e capturar a ESSÊNCIA emocional do filme.

Exemplos de boas tags:
- "Perfeito com pipoca 🍿"
- "Chorei demais 😭"
- "Trama explode a cabeça 🤯"
- "Assista à noite 🌙"
- "Adrenalina total ⚡"
- "Gruda na poltrona 🎬"
- "Final inesquecível 🔥"

Responda APENAS com um JSON array de exatamente 3 strings, nada mais:
["tag1", "tag2", "tag3"]`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s de timeout

    const ollamaRes = await fetch('http://185.173.110.54:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'minimax-m2.5:cloud',
        prompt,
        stream: false,
        options: { temperature: 0.9, num_predict: 120 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      console.error(`[Vibe-AI] VPS retornou erro: ${errText}`);
      return res.status(200).json({ vibe_tags: null, error: 'VPS unavailable' });
    }

    const ollamaData = await ollamaRes.json();
    const rawText = (ollamaData.response || '').trim();
    console.log(`[Vibe-AI] Resposta bruta: ${rawText.slice(0, 200)}`);

    // Parser robusto: extrai qualquer JSON array da resposta
    const jsonMatch = rawText.match(/\[\s*"[^"]*"(?:\s*,\s*"[^"]*")*\s*\]/);
    if (!jsonMatch) {
      console.warn('[Vibe-AI] Não foi possível parsear JSON array da resposta.');
      return res.status(200).json({ vibe_tags: null });
    }

    const tags = JSON.parse(jsonMatch[0]);
    const finalTags = Array.isArray(tags) ? tags.slice(0, 3) : null;

    console.log(`[Vibe-AI] Tags geradas: ${JSON.stringify(finalTags)}`);
    return res.status(200).json({ vibe_tags: finalTags });

  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn(`[Vibe-AI] Timeout ao gerar tags para "${title}"`);
    } else {
      console.error(`[Vibe-AI] Erro inesperado: ${e.message}`);
    }
    return res.status(200).json({ vibe_tags: null }); // Fallback silencioso — nunca bloqueia o card
  }
}
