# Deploy da Pluckten Saúde na Vercel

Este projeto está pronto para rodar na Vercel com:

- site público estático;
- APIs em `api/[...path].js`;
- painel admin em `/admin.html`;
- banco Postgres/Neon em produção via `DATABASE_URL`;
- JSON local para desenvolvimento no computador.

## 1. Criar o projeto na Vercel

1. Crie uma conta em https://vercel.com.
2. Suba este projeto para um repositório GitHub.
3. Na Vercel, clique em `Add New > Project`.
4. Importe o repositório.
5. Framework Preset: `Other`.
6. Build Command: deixe vazio.
7. Output Directory: deixe vazio.

## 2. Criar o banco

No painel da Vercel, conecte um banco Postgres pelo Marketplace, como Neon.

Depois configure a variável:

```text
DATABASE_URL=postgres://...
```

Na primeira execução, o sistema cria as tabelas e copia os produtos iniciais de
`data/products.json` para o banco.

## 3. Configurar senha admin

Configure também:

```text
PLUCKTEN_ADMIN_PASSWORD=uma-senha-forte-aqui
```

Sem essa variável, a senha padrão será `pluckten123`, o que não deve ser usado em produção.

## 4. Publicar

Depois de configurar as variáveis, faça o deploy pela própria Vercel.

URLs principais:

```text
https://seu-dominio.vercel.app/
https://seu-dominio.vercel.app/admin.html
```

## 5. Rodar localmente

```powershell
npm install
npm run dev
```

Loja local:

```text
http://127.0.0.1:4173
```

Admin local:

```text
http://127.0.0.1:4173/admin.html
```
