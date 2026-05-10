import sharp from 'sharp';

export default async function handler(req, res) {
  const { path, w = '500' } = req.query;

  if (!path) {
    return res.status(400).json({ error: "Parâmetro 'path' é obrigatório. Ex: /api/image?path=/poster123.jpg" });
  }

  // Normaliza a largura para evitar abusos
  let width = parseInt(w, 10);
  if (isNaN(width) || width < 100) width = 300;
  if (width > 1000) width = 500; // Cap na largura para economizar CPU

  const tmdbTargetUrl = `https://image.tmdb.org/t/p/original${path.startsWith('/') ? '' : '/'}${path}`;

  try {
    console.log(`[Edge-Image] Otimizando imagem: ${tmdbTargetUrl} -> WebP (${width}px)`);
    
    const imgResponse = await fetch(tmdbTargetUrl);
    if (!imgResponse.ok) {
        throw new Error(`TMDB Origem Indisponível: ${imgResponse.statusText}`);
    }

    const arrayBuffer = await imgResponse.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // O MÁGICO DO SHARP: 
    // 1. Redimensiona de forma suave (lanczos3)
    // 2. Converte para WebP (muito mais leve que JPG)
    // 3. Aplica compressão premium balanceando qualidade e peso
    const optimizedBuffer = await sharp(inputBuffer)
      .resize(width, null, { withoutEnlargement: true }) // Redimensiona mantendo aspecto
      .webp({ quality: 80, effort: 3, smartSubsample: true }) // Qualidade 80 é o Sweet Spot de fidelidade/peso
      .toBuffer();

    // ESTRATÉGIA DE CACHE AGRESSIVA (Vercel Edge Cache)
    // Isso garante que a imagem comprimida seja servida instantaneamente por CDNs em todo o mundo,
    // sem precisar rodar o Sharp toda vez que o mesmo pôster for solicitado.
    res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'image/webp');
    
    return res.status(200).send(optimizedBuffer);

  } catch (err) {
    console.error("[Edge-Image] Falha crítica ao processar, aplicando fallback...", err);
    // FALLBACK TOTAL: Se a VPS ou API explodir, redireciona o navegador para baixar a imagem 
    // original do TMDB sem quebrar a experiência do usuário final.
    return res.redirect(307, `https://image.tmdb.org/t/p/w${width}${path}`);
  }
}
