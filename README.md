# Legit Gift - 

Este projeto em Node.js tem como objetivo **coletar automaticamente** códigos promocionais (giftcodes) a partir de diversas fontes públicas na internet.

Ele é projetado para ser executado como uma automação contínua, idealmente via **GitHub Actions**, para garantir que novos códigos sejam encontrados e notificados rapidamente.

## 🚀 Funcionalidades

- **Scraping de Múltiplas Fontes:** Acessa URLs pré-definidas para buscar novos códigos.
- **Extração Inteligente:** Utiliza expressões regulares (regex) para extrair códigos alfanuméricos com 3 a 20 caracteres do texto das páginas.
- **Deduplicação e Histórico:** Armazena todos os códigos encontrados em `codes.json`, evitando duplicatas e registrando a data da primeira e última vez que o código foi visto.
- **Notificação Instantânea:** Envia uma notificação para um webhook do Discord sempre que um código **novo** é encontrado.
- **Automação Completa:** Configurado para rodar a cada 6 horas via GitHub Actions e fazer commit automático de novos códigos.

## 🛠️ Instalação e Configuração

### 1. Clonar o Repositório

```bash
git clone [SEU_REPOSITORIO_AQUI]
cd legit-gift
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

Crie um arquivo chamado `.env` na raiz do projeto, baseado no `.env.example`, e preencha com o URL do seu Webhook do Discord.

```
# .env
DISCORD_WEBHOOK="SEU_WEBHOOK_DO_DISCORD_AQUI"
```

### 4. Execução Local

Você pode executar o coletor manualmente para testes:

```bash
npm start
```

## ⚙️ Automação com GitHub Actions

O projeto inclui um fluxo de trabalho em `.github/workflows/collect.yml` que automatiza a coleta de códigos.

### Passo a Passo para Ativar a Automação

1. **Crie um Repositório:** Faça o upload deste projeto para um novo repositório no GitHub.
2. **Configure o Secret do Discord:**
    - No seu repositório, vá em **Settings** (Configurações).
    - Clique em **Secrets and variables** > **Actions** (Segredos e variáveis > Ações).
    - Clique em **New repository secret** (Novo segredo de repositório).
    - **Nome:** `DISCORD_WEBHOOK`
    - **Valor:** Cole o URL completo do seu Webhook do Discord.
3. **Ative a Permissão de Escrita:**
    - No seu repositório, vá em **Settings** (Configurações).
    - Clique em **Actions** > **General** (Ações > Geral).
    - Role até a seção **Workflow permissions** (Permissões de fluxo de trabalho).
    - Selecione a opção **Read and write permissions** (Permissões de leitura e escrita).
    - Clique em **Save** (Salvar).
4. **Ative o Workflow:** O workflow está configurado para rodar automaticamente a cada 6 horas. Você pode forçar a primeira execução manualmente na aba **Actions** (Ações) do seu repositório.

## 📂 Estrutura do Projeto

```
legit-gift/
├─ collector.js          → Script principal de coleta, extração, comparação e notificação.
├─ codes.json            → Base de dados local dos códigos encontrados.
├─ package.json          → Dependências e scripts.
├─ .env.example          → Template para variáveis de ambiente.
├─ .github/workflows/    → Pasta de configuração do GitHub Actions.
│  └─ collect.yml        → Workflow que roda a coleta a cada 6 horas.
└─ README.md             → Este arquivo.
```

