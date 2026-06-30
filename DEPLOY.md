# Deploy da Pluckten Distribuidora Med com Vercel + Supabase

Este projeto roda com:

- site público estático;
- APIs em `api/[...path].js`;
- painel admin em `/admin.html`;
- Supabase Database para produtos e pedidos;
- Supabase Storage para fotos de produtos;
- JSON local para desenvolvimento sem Supabase.

## 1. Criar o projeto no Supabase

1. Acesse https://supabase.com.
2. Crie um projeto chamado `pluckten-saude`.
3. Guarde a senha do banco.

## 2. Criar tabelas e bucket

No Supabase:

1. Vá em `SQL Editor`.
2. Cole o conteúdo do arquivo `supabase-schema.sql`.
3. Clique em `Run`.

Isso cria:

- tabela `products`;
- tabela `orders`;
- bucket público `product-images`.

## 3. Pegar chaves do Supabase

No Supabase:

1. Vá em `Project Settings > API`.
2. Copie `Project URL`.
3. Copie a chave `service_role`.

Importante: a chave `service_role` deve ficar somente na Vercel, nunca em código de navegador.

## 4. Configurar variáveis na Vercel

No projeto da Vercel, vá em:

```text
Settings > Environment Variables
```

Crie:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
SUPABASE_STORAGE_BUCKET=product-images
PLUCKTEN_ADMIN_PASSWORD=uma-senha-forte
```

`SUPABASE_STORAGE_BUCKET` é opcional se você usar o nome padrão `product-images`.

## 5. Deploy na Vercel

Configuração recomendada:

```text
Framework Preset: Other
Build Command: vazio
Output Directory: vazio
Install Command: npm install
Root Directory: ./
```

Depois clique em `Deploy`.

## 6. Acessar

```text
https://seu-dominio.vercel.app/
https://seu-dominio.vercel.app/admin.html
```

## 7. Rodar localmente

Sem Supabase, o projeto usa os arquivos `data/products.json` e `data/orders.json`.

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
