---
trigger: always_on
---

🎬 🎨 UX / UI (Experiência do usuário)
Todas as telas devem ter animações suaves de entrada (fade + slide)
Transições entre telas devem durar entre 200ms e 300ms
Swipe de cards deve ter:
leve rotação
feedback visual (like 👍 / dislike 👎)
Sempre mostrar preview do próximo card atrás (stack effect)
Evitar telas “mortas” → sempre ter microinterações
Botões devem ter feedback visual ao toque (scale 0.95 ou ripple)
📱 📐 Layout e responsividade
Mobile-first SEMPRE
Cards de filmes devem ocupar ~80% da largura da tela
Pôster sempre com proporção 2:3 (padrão cinema)
Espaçamento padrão:
8px (micro)
16px (normal)
24px (seções)
Nunca colar elementos nas bordas
🎞️ Cards (core do app)
Cada card deve conter:
imagem (poster)
título
nota ⭐
gêneros
Swipe:
direita → like
esquerda → dislike
Ao dar like:
animar card saindo pra direita
disparar haptic feedback (se mobile)
Não permitir travar swipe (sempre fluido)
⚡ Performance
Lazy load de imagens (IMPORTANTÍSSIMO)
Cache de filmes já carregados
Pré-carregar próximos 5–10 filmes
Skeleton loading ao invés de spinner
🧠 Estado da aplicação
Separar:
dados da API (filmes)
estado do usuário (likes)
Nunca depender direto da API na UI (sempre usar state)
Likes devem ser salvos localmente primeiro (UX rápida)
💾 Persistência
Likes devem ser salvos:
localStorage (rápido)
backend (persistente)
Estrutura mínima:
{
  "userId": "123",
  "movieId": 550,
  "liked": true,
  "createdAt": "2026-04-22"
}
🔍 Navegação
Fluxo simples:
Home (swipe)
Watchlist (filmes curtidos)
Detalhes do filme
Nunca mais que 3 níveis de navegação
Sempre ter botão de voltar claro
🎯 Regras de API (TMDb)
Nunca chamar API diretamente no componente
Criar um service:
movieService.getPopular()
movieService.getTrending()
Tratar erro de API (fallback UI)
🧩 Componentização
Tudo reutilizável:
MovieCard
SwipeContainer
Button
Nunca duplicar código de UI
Separar:
UI (visual)
lógica (hooks/services)
🎨 Design system
Definir cores fixas:
primary (ex: vermelho Netflix-like)
background (dark mode padrão)
Tipografia consistente
Ícones sempre do mesmo pacote
🚨 Feedback pro usuário
Ao dar like:
mostrar animação + toast ("Adicionado à sua lista 🎬")
Ao erro:
mensagem clara (sem erro técnico)
Loading:
nunca tela vazia
🔐 Boas práticas gerais
Nunca expor API key no frontend puro
Usar .env
Nome de arquivos padronizado:
movie-card.js
movie-service.js
🧠 Regra de ouro do MatchFlix

Se não for rápido, fluido e gostoso de usar → está errado.