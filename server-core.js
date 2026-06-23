const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const MAX_BODY_SIZE = 8 * 1024 * 1024;
const ADMIN_PASSWORD = process.env.PLUCKTEN_ADMIN_PASSWORD || "pluckten123";
const COOKIE_NAME = "pluckten_session";
const SESSION_MAX_AGE = 60 * 60 * 24;

let neonSql;
let dbReady;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

async function getSql() {
  if (!hasDatabase()) return null;
  if (!neonSql) {
    const { neon } = await import("@neondatabase/serverless");
    neonSql = neon(process.env.DATABASE_URL);
  }
  return neonSql;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function ensureDb() {
  if (!hasDatabase()) return;
  if (!dbReady) {
    dbReady = (async () => {
      const sql = await getSql();
      await sql`
        create table if not exists products (
          id text primary key,
          data jsonb not null,
          updated_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists orders (
          id text primary key,
          data jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `;

      const count = await sql`select count(*)::int as count from products`;
      if (count[0].count === 0) {
        const seedProducts = readJson(PRODUCTS_FILE, []);
        for (const product of seedProducts) {
          await sql`
            insert into products (id, data, updated_at)
            values (${product.id}, ${JSON.stringify(product)}, now())
            on conflict (id) do nothing
          `;
        }
      }
    })();
  }
  await dbReady;
}

async function listProducts({ includeInactive = false } = {}) {
  if (hasDatabase()) {
    await ensureDb();
    const sql = await getSql();
    const rows = await sql`select data from products order by updated_at desc`;
    const products = rows.map((row) => row.data);
    return includeInactive ? products : products.filter((product) => product.active !== false);
  }

  const products = readJson(PRODUCTS_FILE, []);
  return includeInactive ? products : products.filter((product) => product.active !== false);
}

async function saveProduct(product) {
  if (hasDatabase()) {
    await ensureDb();
    const sql = await getSql();
    await sql`
      insert into products (id, data, updated_at)
      values (${product.id}, ${JSON.stringify(product)}, now())
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
    return product;
  }

  const products = readJson(PRODUCTS_FILE, []);
  const index = products.findIndex((entry) => entry.id === product.id);
  if (index >= 0) {
    products[index] = product;
  } else {
    products.unshift(product);
  }
  writeJson(PRODUCTS_FILE, products);
  return product;
}

async function removeProduct(id) {
  if (hasDatabase()) {
    await ensureDb();
    const sql = await getSql();
    await sql`delete from products where id = ${id}`;
    return;
  }

  writeJson(
    PRODUCTS_FILE,
    readJson(PRODUCTS_FILE, []).filter((product) => product.id !== id),
  );
}

async function listOrders() {
  if (hasDatabase()) {
    await ensureDb();
    const sql = await getSql();
    const rows = await sql`select data from orders order by created_at desc`;
    return rows.map((row) => row.data);
  }

  return readJson(ORDERS_FILE, []);
}

async function saveOrder(order) {
  if (hasDatabase()) {
    await ensureDb();
    const sql = await getSql();
    await sql`
      insert into orders (id, data, created_at, updated_at)
      values (${order.id}, ${JSON.stringify(order)}, ${order.createdAt}, ${order.updatedAt})
      on conflict (id) do update set data = excluded.data, updated_at = now()
    `;
    return order;
  }

  const orders = readJson(ORDERS_FILE, []);
  const index = orders.findIndex((entry) => entry.id === order.id);
  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }
  writeJson(ORDERS_FILE, orders);
  return order;
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...value] = part.split("=");
        return [key, decodeURIComponent(value.join("="))];
      }),
  );
}

function signSession(timestamp) {
  return crypto.createHmac("sha256", ADMIN_PASSWORD).update(String(timestamp)).digest("hex");
}

function isAuthed(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;

  const [timestamp, signature] = token.split(".");
  const age = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!timestamp || !signature || !Number.isFinite(age) || age < 0 || age > SESSION_MAX_AGE) {
    return false;
  }

  const expected = signSession(timestamp);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  sendJson(res, 401, { error: "Acesso administrativo não autorizado." });
  return false;
}

function cookieSecureAttribute(req) {
  const host = req.headers.host || "";
  return host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "" : "; Secure";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = "";

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Payload muito grande."));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON inválido."));
      }
    });
    req.on("error", reject);
  });
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

function normalizeProduct(input, existingId) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome do produto é obrigatório.");

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido.");

  const baseId = existingId || input.id || name;
  return {
    id: slugify(baseId) || crypto.randomUUID(),
    name,
    category: String(input.category || "Geral").trim(),
    pack: String(input.pack || "Unidade").trim(),
    description: String(input.description || "").trim(),
    price,
    stock: Math.max(0, Number(input.stock || 0)),
    active: Boolean(input.active),
    image: String(input.image || "assets/hero-kit.png").trim(),
  };
}

async function createOrder(payload) {
  const products = await listProducts();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const resolvedItems = items
    .map((item) => {
      const product = products.find((entry) => entry.id === item.id);
      const quantity = Math.max(1, Number(item.quantity || 1));
      if (!product) return null;

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        subtotal: Number((product.price * quantity).toFixed(2)),
      };
    })
    .filter(Boolean);

  if (resolvedItems.length === 0) throw new Error("Adicione ao menos um produto.");

  const customer = payload.customer || {};
  const name = String(customer.name || "").trim();
  const phone = String(customer.phone || "").trim();
  if (!name || !phone) throw new Error("Nome e telefone são obrigatórios.");

  const now = new Date();
  const total = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    id: `PLK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
      now.getDate(),
    ).padStart(2, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "novo",
    deadline: "",
    deliveryMethod: String(payload.deliveryMethod || "A combinar").trim(),
    customer: {
      name,
      phone,
      email: String(customer.email || "").trim(),
      document: String(customer.document || "").trim(),
      address: String(customer.address || "").trim(),
      notes: String(customer.notes || "").trim(),
    },
    items: resolvedItems,
    total: Number(total.toFixed(2)),
    internalNotes: "",
  };
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/products") {
      sendJson(res, 200, { products: await listProducts() });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      const order = await createOrder(await readBody(req));
      await saveOrder(order);
      sendJson(res, 201, { order });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const body = await readBody(req);
      if (String(body.password || "") !== ADMIN_PASSWORD) {
        sendJson(res, 401, { error: "Senha inválida." });
        return true;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const token = `${timestamp}.${signSession(timestamp)}`;
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${cookieSecureAttribute(req)}`,
      });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/logout") {
      sendJson(res, 200, { ok: true }, {
        "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${cookieSecureAttribute(req)}`,
      });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/admin/session") {
      sendJson(res, 200, { authed: isAuthed(req) });
      return true;
    }

    if (pathname.startsWith("/api/admin/") && !requireAuth(req, res)) {
      return true;
    }

    if (req.method === "GET" && pathname === "/api/admin/products") {
      sendJson(res, 200, { products: await listProducts({ includeInactive: true }) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/products") {
      const products = await listProducts({ includeInactive: true });
      const product = normalizeProduct(await readBody(req));
      if (products.some((item) => item.id === product.id)) {
        throw new Error("Já existe produto com esse identificador.");
      }
      await saveProduct(product);
      sendJson(res, 201, { product });
      return true;
    }

    const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (productMatch && req.method === "PUT") {
      const products = await listProducts({ includeInactive: true });
      const id = decodeURIComponent(productMatch[1]);
      if (!products.some((product) => product.id === id)) throw new Error("Produto não encontrado.");

      const product = normalizeProduct(await readBody(req), id);
      await saveProduct(product);
      sendJson(res, 200, { product });
      return true;
    }

    if (productMatch && req.method === "DELETE") {
      await removeProduct(decodeURIComponent(productMatch[1]));
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/admin/orders") {
      sendJson(res, 200, { orders: await listOrders() });
      return true;
    }

    const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (orderMatch && req.method === "PATCH") {
      const orders = await listOrders();
      const id = decodeURIComponent(orderMatch[1]);
      const order = orders.find((entry) => entry.id === id);
      if (!order) throw new Error("Pedido não encontrado.");

      const body = await readBody(req);
      const nextOrder = {
        ...order,
        status: String(body.status || order.status),
        deadline: String(body.deadline || ""),
        deliveryMethod: String(body.deliveryMethod || order.deliveryMethod || ""),
        internalNotes: String(body.internalNotes || ""),
        updatedAt: new Date().toISOString(),
      };
      await saveOrder(nextOrder);
      sendJson(res, 200, { order: nextOrder });
      return true;
    }
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Erro na requisição." });
    return true;
  }

  return false;
}

module.exports = {
  handleApi,
  readJson,
  ROOT,
};
