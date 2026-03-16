# Dominio Pro v2.0 — Guia de Instalacao Completo

## O que voce vai precisar
- Conta no **Supabase** (banco de dados gratuito)
- Conta no **Vercel** (hospedagem gratuita)
- Conta no **GitHub** (para conectar Vercel ao projeto)

Tempo estimado: **20-30 minutos**

---

## Novidades da v2.0

- **Abertura automatica do caixa** — O caixa abre sozinho ao iniciar o app, com saldo do dia anterior
- **Historico pessoal de servicos** — Ao selecionar um cliente no agendamento, veja suas visitas, servicos frequentes e profissional habitual
- **Reagendamento inteligente** — Botao "Repetir ultima visita" pre-preenche servicos e profissional
- **Correcao de bugs** — Race condition no auto-launch de caixa, cores CSS dinamicas, dependencias de cache corrigidas
- **Visual modernizado** — Animacoes suaves, texto gradiente, efeitos glassmorphism aprimorados
- **Configuracao de automacao** — Toggle para ativar/desativar abertura automatica do caixa

---

## PASSO 1 — Criar conta no Supabase

1. Acesse **https://supabase.com**
2. Clique em **Start your project**
3. Crie conta com Google ou GitHub
4. Clique em **New Project**
5. Preencha:
   - **Name:** `dominio-pro`
   - **Database Password:** crie uma senha forte e guarde
   - **Region:** `South America (Sao Paulo)`
6. Clique em **Create new project**
7. Aguarde ~2 minutos enquanto o projeto e criado

---

## PASSO 2 — Criar as tabelas no banco

1. No seu projeto Supabase, clique em **SQL Editor** (menu lateral)
2. Clique em **New Query**
3. Abra o arquivo **`supabase-schema.sql`** que esta neste zip
4. Copie todo o conteudo e cole no editor do Supabase
5. Clique em **Run** (botao verde)
6. Deve aparecer "Success" — as tabelas foram criadas!

---

## PASSO 3 — Pegar as chaves de acesso

1. No menu lateral do Supabase, clique em **Settings** (icone de engrenagem)
2. Clique em **API**
3. Voce vai ver dois valores — guarde os dois:
   - **Project URL** — algo como `https://abcdefgh.supabase.co`
   - **anon public** (em Project API Keys) — texto longo comecando com `eyJ...`

---

## PASSO 4 — Subir o projeto no GitHub

1. Acesse **https://github.com** e crie uma conta (se nao tiver)
2. Clique em **+** > **New repository**
3. Nome: `dominio-pro` | Deixe **Private** | Clique em **Create repository**
4. Na proxima tela clique em **uploading an existing file**
5. Extraia o conteudo deste zip no seu computador
6. Arraste a pasta **`dominio-pro-main`** inteira para o GitHub
7. Clique em **Commit changes**

---

## PASSO 5 — Publicar no Vercel

1. Acesse **https://vercel.com**
2. Crie conta com o mesmo GitHub
3. Clique em **Add New Project**
4. Selecione o repositorio `dominio-pro`
5. Configure:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist/public`
6. Antes de clicar em Deploy, clique em **Environment Variables** e adicione:

   | Nome | Valor |
   |------|-------|
   | `VITE_SUPABASE_URL` | sua URL do Supabase (passo 3) |
   | `VITE_SUPABASE_ANON_KEY` | sua chave anon do Supabase (passo 3) |

7. Clique em **Deploy**
8. Aguarde ~2 minutos

---

## PASSO 6 — Acessar o app!

O Vercel vai gerar um link tipo:
`https://dominio-pro-xxx.vercel.app`

Esse link funciona em **qualquer celular ou computador** ao mesmo tempo!

### Instalar no celular como app:

**iPhone (Safari):**
1. Abra o link no Safari
2. Toque em **Compartilhar**
3. Role e toque em **"Adicionar a Tela de Inicio"**
4. Toque em **Adicionar**

**Android (Chrome):**
1. Abra o link no Chrome
2. Toque em **tres pontos** (menu)
3. Toque em **"Adicionar a tela inicial"**

---

## Duvidas frequentes

**O app esta em branco / mostrando erro de conexao?**
- Verifique se as variaveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` foram adicionadas corretamente no Vercel

**Esqueci de rodar o SQL das tabelas?**
- Volte ao Supabase > SQL Editor > cole o conteudo de `supabase-schema.sql` e clique em Run

**Quero usar no computador localmente?**
1. Copie `.env.example` e renomeie para `.env`
2. Preencha com suas chaves do Supabase
3. Execute: `npm install && npm run dev`
4. Acesse `http://localhost:3000`

**Como desativar a abertura automatica do caixa?**
- Va em Configuracoes > Automacao > Desative "Abertura automatica do caixa"

---

Dominio Pro v2.0 — Sistema de Gestao para Saloes de Beleza
