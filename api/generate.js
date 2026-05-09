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
    console.log('[Proxy] Encaminhando requisição para a VPS Ollama...');
    
    const response = await fetch('http://185.173.110.54:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Proxy] Erro da API Ollama VPS:', errorText);
      return res.status(response.status).json({ error: 'Falha ao obter resposta do Ollama', details: errorText });
    }

    const data = await response.json();
    console.log('[Proxy] Resposta obtida com sucesso da VPS Ollama.');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[Proxy] Erro interno no manipulador:', error);
    return res.status(500).json({ error: 'Erro Interno do Servidor', details: error.message });
  }
}
