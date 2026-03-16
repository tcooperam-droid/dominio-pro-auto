# Salão Bella — Brainstorm de Design

## Contexto
Sistema de gestão para salão de beleza. Aplicação interna (admin/dashboard), não é landing page pública. Precisa ser funcional, legível e profissional. Foco em produtividade e clareza visual.

---

<response>
## Ideia 1 — "Soft Luxe" (Minimalismo Elegante com Tons Quentes)

<text>
**Design Movement**: Inspirado no minimalismo escandinavo com toques de luxo suave — linhas limpas, espaçamento generoso, tipografia refinada.

**Core Principles**:
1. Clareza funcional — cada elemento tem propósito claro
2. Hierarquia tipográfica forte — títulos bold, corpo leve
3. Paleta quente e acolhedora — tons de rosa antigo e dourado sutil
4. Espaço negativo como elemento de design

**Color Philosophy**: Rosa antigo (#ec4899 como accent) sobre fundos escuros profundos (slate/zinc). O rosa evoca feminilidade e beleza sem ser infantil. Dourado sutil nos destaques. Tema escuro como padrão para sofisticação.

**Layout Paradigm**: Sidebar fixa à esquerda com navegação vertical. Conteúdo principal com cards arredondados e sombras suaves. Grid assimétrico para dashboards.

**Signature Elements**:
- Indicadores coloridos por funcionário (dots/pills)
- Cards com barra de cor no topo (como no código original)
- Transições suaves em hover com scale sutil

**Interaction Philosophy**: Feedback imediato via toasts. Modais elegantes para formulários. Hover states com brilho sutil.

**Animation**: Fade-in suave nos cards ao carregar. Transições de 200ms em navegação. Pulse sutil em indicadores de status ativo.

**Typography System**: DM Sans para headings (bold, tracking-tight), Inter para corpo. Tamanhos: h1=24px bold, h2=20px semibold, body=14px regular.
</text>
<probability>0.08</probability>
</response>

---

<response>
## Ideia 2 — "Neo-Brutalist Salon" (Contraste Alto, Formas Geométricas)

<text>
**Design Movement**: Neo-brutalismo digital — bordas duras, sombras offset, cores saturadas em blocos. Ousado e memorável.

**Core Principles**:
1. Contraste máximo — preto/branco com acentos vibrantes
2. Bordas definidas — sem rounded corners excessivos, box-shadow offset
3. Tipografia impactante — fontes display pesadas
4. Funcionalidade sobre decoração

**Color Philosophy**: Fundo quase preto (#0a0a0a), texto branco puro, accent em magenta vibrante (#ec4899) e amarelo (#f59e0b). Cores de status saturadas e diretas.

**Layout Paradigm**: Grid rígido com sidebar compacta. Seções divididas por linhas grossas. Tabelas com headers destacados.

**Signature Elements**:
- Sombras offset (2px 2px) em cards
- Bordas de 2px sólidas
- Badges com fundo sólido e texto contrastante

**Interaction Philosophy**: Cliques com feedback visual imediato (scale down). Estados hover com inversão de cores. Sem animações desnecessárias.

**Animation**: Mínima — apenas transições de estado (open/close). Sem fade-in decorativo.

**Typography System**: Space Grotesk para tudo. Headings em 700, corpo em 400. Monospace para valores numéricos (preços, horários).
</text>
<probability>0.04</probability>
</response>

---

<response>
## Ideia 3 — "Glass Dashboard" (Glassmorphism Moderno com Tema Escuro)

<text>
**Design Movement**: Glassmorphism refinado — superfícies translúcidas, blur de fundo, gradientes sutis. Moderno e premium.

**Core Principles**:
1. Profundidade através de camadas — cards com backdrop-blur
2. Gradientes sutis — não chamativos, apenas para criar dimensão
3. Tema escuro como base — fundo escuro com superfícies semi-transparentes
4. Acentos de cor vibrantes mas contidos

**Color Philosophy**: Fundo escuro profundo (zinc-950). Cards com bg-white/5 e backdrop-blur. Accent em rosa (#ec4899) para ações primárias. Verde esmeralda para status positivo. Âmbar para alertas. Bordas em white/10 para separação sutil.

**Layout Paradigm**: Sidebar com fundo translúcido. Conteúdo principal com cards "flutuantes" sobre fundo com gradiente sutil. Espaçamento generoso entre seções.

**Signature Elements**:
- Cards com backdrop-blur-xl e border white/10
- Gradiente sutil no fundo (de zinc-950 para zinc-900)
- Glow sutil em elementos focados (ring com opacity)

**Interaction Philosophy**: Hover com aumento sutil de opacidade do fundo. Focus rings com glow colorido. Transições fluidas em tudo.

**Animation**: Entrada com fade-in + translateY sutil (staggered). Hover com transição de 150ms. Loading states com skeleton shimmer.

**Typography System**: Plus Jakarta Sans para headings (semibold/bold), sistema sans-serif para corpo. Números tabulares para alinhamento em tabelas financeiras.
</text>
<probability>0.07</probability>
</response>

---

## Decisão

Escolho a **Ideia 3 — "Glass Dashboard"** por ser a mais adequada para um sistema de gestão de salão:
- O tema escuro reduz fadiga visual em uso prolongado
- O glassmorphism cria profundidade sem complexidade
- A paleta com rosa como accent combina com o universo de beleza
- O layout com sidebar fixa é ideal para navegação entre módulos
- A tipografia Plus Jakarta Sans é moderna e altamente legível
