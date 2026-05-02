# LmAutomoveis

## Backend local

O projeto agora pode rodar com um backend simples em Node.js + Express + persistência local em JSON.

### O que foi adicionado

- API local em `/api/vehicles`
- Banco local em `data/vehicles.json`
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

Depois abra:

- `http://localhost:3000/estoque.html`
- `http://localhost:3000/detalhes.html`
- `http://localhost:3000/admin.html`

### Login do painel

- Usuário padrão: `admin`
- Senha padrão: `lm123456`
- Em produção, troque isso com `ADMIN_USERNAME` e `ADMIN_PASSWORD`

### Observações

- Na primeira subida do servidor, os cards atuais de `estoque.html` são importados para o banco.
- O painel usa URLs de imagem por enquanto. Se quiser, o próximo passo natural é adicionar upload de fotos.