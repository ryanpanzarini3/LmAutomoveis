# LmAutomoveis

## Backend

O projeto roda com Node.js + Express e suporta dois modos de persistencia:

- PostgreSQL (recomendado para producao)
- JSON local em `data/vehicles.json` (fallback para desenvolvimento)

### O que foi adicionado

- API local em `/api/vehicles`
- Banco PostgreSQL via `DATABASE_URL`
- Fallback local em `data/vehicles.json` quando `DATABASE_URL` nao estiver definido
- Importação automática do estoque atual na primeira execução
- Painel interno em `/admin.html` para cadastrar e excluir veículos

### Pré-requisito

Instale o Node.js 20 ou superior para ter acesso a `node` e `npm`.

### Como rodar

```bash
npm install
npm start
```

Se quiser trocar o login padrão antes de subir:

```bash
set ADMIN_USERNAME=operador
set ADMIN_PASSWORD=sua-senha-forte
npm start
```

### Rodando com PostgreSQL

Defina a URL de conexao antes de iniciar:

```bash
set DATABASE_URL=postgresql://usuario:senha@localhost:5432/lm_automoveis
set PGSSL=false
npm start
```

### Criando o banco PostgreSQL (jeito mais facil)

Se voce ainda nao sabe criar banco, use Docker Desktop:

1. Instale Docker Desktop no Windows.
2. No terminal, dentro da pasta do projeto, rode:

```bash
docker compose up -d
```

3. Defina as variaveis e inicie o projeto:

```bash
set DATABASE_URL=postgresql://lm_user:lm_password_2026@localhost:5432/lm_automoveis
set PGSSL=false
npm start
```

Pronto: o banco ja sera criado automaticamente e o servidor criara a tabela `vehicles` na primeira inicializacao.

Notas:

- Se o banco estiver vazio, o servidor importa automaticamente os dados existentes de `data/vehicles.json`.
- Se nao houver `data/vehicles.json`, ele importa os cards de `estoque.html` como seed inicial.
- Em producao, normalmente o `PGSSL` deve ficar ativo (remova `PGSSL=false`).

Depois abra:

- `http://localhost:3000/estoque.html`
- `http://localhost:3000/detalhes.html`
- `http://localhost:3000/admin.html`

### Login do painel

- Usuário padrão: `admin`
- Senha padrão: `lm123456`
- Em produção, troque isso com `ADMIN_USERNAME` e `ADMIN_PASSWORD`

### Observações

- Na primeira subida sem `DATABASE_URL`, os cards de `estoque.html` sao importados para `data/vehicles.json`.
- Na primeira subida com `DATABASE_URL`, o banco PostgreSQL recebe seed automatico a partir do JSON local (se existir) ou do `estoque.html`.
- O painel usa URLs de imagem por enquanto. Se quiser, o próximo passo natural é adicionar upload de fotos.