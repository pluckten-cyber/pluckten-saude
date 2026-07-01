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
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "product-images";
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

let supabaseClient;
let seedReady;
const loginAttempts = new Map();

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; "),
};

function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function getSupabase() {
  if (!hasSupabase()) return null;
  if (!supabaseClient) {
    const { createClient } = await import("@supabase/supabase-js");
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return supabaseClient;
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

async function ensureSupabaseSeed() {
  if (!hasSupabase()) return;
  if (!seedReady) {
    seedReady = (async () => {
      const supabase = await getSupabase();
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true });

      if (error) throw new Error(`Supabase products: ${error.message}`);
      if (count && count > 0) return;

      const seedProducts = readJson(PRODUCTS_FILE, []);
      for (const product of seedProducts) {
        const { error: insertError } = await supabase.from("products").upsert({
          id: product.id,
          data: product,
          updated_at: new Date().toISOString(),
        });
        if (insertError) throw new Error(`Supabase seed: ${insertError.message}`);
      }
    })();
  }
  await seedReady;
}

async function listProducts({ includeInactive = false } = {}) {
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("data")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(`Supabase products: ${error.message}`);
    const products = data.map((row) => row.data);
    return includeInactive ? products : products.filter((product) => product.active !== false);
  }

  const products = readJson(PRODUCTS_FILE, []);
  return includeInactive ? products : products.filter((product) => product.active !== false);
}

async function saveProduct(product) {
  validateProductImage(product.image);
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const productToSave = await uploadProductImage(product);
    const { error } = await supabase.from("products").upsert({
      id: productToSave.id,
      data: productToSave,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`Supabase save product: ${error.message}`);
    return productToSave;
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
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(`Supabase delete product: ${error.message}`);
    return;
  }

  writeJson(
    PRODUCTS_FILE,
    readJson(PRODUCTS_FILE, []).filter((product) => product.id !== id),
  );
}

async function listOrders() {
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("orders")
      .select("data")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase orders: ${error.message}`);
    return data.map((row) => row.data);
  }

  return readJson(ORDERS_FILE, []);
}

async function saveOrder(order) {
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const { error } = await supabase.from("orders").upsert({
      id: order.id,
      data: order,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
    });
    if (error) throw new Error(`Supabase save order: ${error.message}`);
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

async function removeOrder(id) {
  if (hasSupabase()) {
    await ensureSupabaseSeed();
    const supabase = await getSupabase();
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) throw new Error(`Supabase delete order: ${error.message}`);
    return;
  }

  writeJson(
    ORDERS_FILE,
    readJson(ORDERS_FILE, []).filter((order) => order.id !== id),
  );
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
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

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "local")
    .split(",")[0]
    .trim();
}

function loginState(req) {
  const key = clientIp(req);
  const current = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  if (current.blockedUntil && current.blockedUntil < Date.now()) {
    loginAttempts.delete(key);
    return { key, count: 0, blockedUntil: 0 };
  }
  return { key, ...current };
}

function registerLoginFailure(req) {
  const state = loginState(req);
  const count = state.count + 1;
  loginAttempts.set(state.key, {
    count,
    blockedUntil: count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_BLOCK_MS : 0,
  });
}

function clearLoginFailures(req) {
  loginAttempts.delete(clientIp(req));
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

function normalizeVariants(input, productName) {
  const variants = Array.isArray(input.variants) ? input.variants : [];
  return variants
    .map((variant) => {
      const name = String(variant.name || "").trim();
      const price = Number(variant.price);
      if (!name || !Number.isFinite(price) || price < 0) return null;

      const baseId = variant.id || `${productName}-${name}`;
      return {
        id: slugify(baseId) || crypto.randomUUID(),
        name,
        price,
        stock: Math.max(0, Number(variant.stock || 0)),
        sku: String(variant.sku || "").trim(),
      };
    })
    .filter(Boolean);
}

function normalizeProduct(input, existingId) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Nome do produto é obrigatório.");

  const price = Number(input.price);
  if (!Number.isFinite(price) || price < 0) throw new Error("Preço inválido.");

  const availability = ["in_stock", "on_request", "unavailable"].includes(input.availability)
    ? input.availability
    : "in_stock";
  const baseId = existingId || input.id || name;
  return {
    id: slugify(baseId) || crypto.randomUUID(),
    name,
    category: String(input.category || "Geral").trim(),
    pack: String(input.pack || "Unidade").trim(),
    brand: String(input.brand || "").trim(),
    sku: String(input.sku || "").trim(),
    description: String(input.description || "").trim(),
    usage: String(input.usage || "").trim(),
    salesNotes: String(input.salesNotes || "").trim(),
    variants: normalizeVariants(input, name),
    price,
    cost: Math.max(0, Number(input.cost || 0)),
    stock: Math.max(0, Number(input.stock || 0)),
    anvisa: String(input.anvisa || "").trim(),
    availability,
    batch: String(input.batch || "").trim(),
    validity: String(input.validity || "").trim(),
    active: Boolean(input.active),
    image: String(input.image || "assets/hero-kit.png").trim(),
  };
}

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function extensionFromMime(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "jpg";
}

function validateProductImage(value) {
  const parsed = parseDataUrl(value);
  if (!parsed) return;
  if (!ALLOWED_IMAGE_TYPES.has(String(parsed.mimeType || "").toLowerCase())) {
    throw new Error("Formato de imagem inválido. Use PNG, JPG, WEBP ou GIF.");
  }
  if (!parsed.buffer.length || parsed.buffer.length > MAX_BODY_SIZE) {
    throw new Error("Imagem inválida ou muito grande.");
  }
}

async function uploadProductImage(product) {
  const parsed = parseDataUrl(product.image);
  if (!parsed) return product;
  validateProductImage(product.image);

  const supabase = await getSupabase();
  const extension = extensionFromMime(parsed.mimeType);
  const filePath = `products/${product.id}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(filePath, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: true,
    });

  if (uploadError) throw new Error(`Supabase upload: ${uploadError.message}`);

  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(filePath);
  return {
    ...product,
    image: data.publicUrl,
  };
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function phonesMatch(a, b) {
  const left = onlyDigits(a);
  const right = onlyDigits(b);
  if (!left || !right) return false;
  return left.endsWith(right) || right.endsWith(left);
}

function publicProduct(product) {
  const { cost, history, ...safeProduct } = product || {};
  return safeProduct;
}

function publicOrder(order) {
  const customer = order.customer || {};
  return {
    id: order.id,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    status: order.status,
    deadline: order.deadline,
    deliveryMethod: customer.deliveryPreference || order.deliveryMethod || "A combinar",
    paymentPreference: customer.paymentPreference || "A combinar",
    customer: {
      name: customer.name,
      phone: customer.phone,
    },
    items: (order.items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    total: order.total,
  };
}

function productHistoryEntry(title, detail = "") {
  return {
    at: new Date().toISOString(),
    title,
    detail,
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
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const variant = item.variantId ? variants.find((entry) => entry.id === item.variantId) : null;
      if (item.variantId && !variant) return null;
      const itemName = variant ? `${product.name} - ${variant.name}` : variants.length ? `${product.name} - Kit padrão` : product.name;
      const itemPrice = variant ? variant.price : product.price;

      return {
        id: product.id,
        variantId: variant?.id || "",
        name: itemName,
        variantName: variant?.name || "",
        price: itemPrice,
        quantity,
        subtotal: Number((itemPrice * quantity).toFixed(2)),
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
      paymentPreference: String(customer.paymentPreference || "A combinar").trim(),
      deliveryPreference: String(customer.deliveryPreference || payload.deliveryMethod || "A combinar").trim(),
      address: String(customer.address || "").trim(),
      notes: String(customer.notes || "").trim(),
    },
    items: resolvedItems,
    total: Number(total.toFixed(2)),
    internalNotes: "",
    history: [
      {
        at: now.toISOString(),
        title: "Pedido recebido",
        detail: "Cotação enviada pelo site.",
      },
    ],
  };
}

async function handleApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/products") {
      const products = await listProducts();
      sendJson(res, 200, { products: products.map(publicProduct) });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/orders/status") {
      const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
      const orderId = String(url.searchParams.get("orderId") || "").trim();
      const phone = String(url.searchParams.get("phone") || "").trim();
      if (!orderId || !phone) throw new Error("Informe código do pedido e WhatsApp.");

      const orders = await listOrders();
      const order = orders.find((entry) => String(entry.id).toLowerCase() === orderId.toLowerCase());
      if (!order || !phonesMatch(order.customer?.phone, phone)) {
        throw new Error("Pedido não encontrado para esse telefone.");
      }

      sendJson(res, 200, { order: publicOrder(order) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      const order = await createOrder(await readBody(req));
      await saveOrder(order);
      sendJson(res, 201, { order });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/admin/login") {
      const attempt = loginState(req);
      if (attempt.blockedUntil && attempt.blockedUntil > Date.now()) {
        const minutes = Math.ceil((attempt.blockedUntil - Date.now()) / 60000);
        sendJson(res, 429, { error: `Muitas tentativas. Tente novamente em ${minutes} min.` });
        return true;
      }

      const body = await readBody(req);
      if (String(body.password || "") !== ADMIN_PASSWORD) {
        registerLoginFailure(req);
        sendJson(res, 401, { error: "Senha inválida." });
        return true;
      }

      clearLoginFailures(req);
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

    if (req.method === "GET" && pathname === "/api/admin/backup") {
      sendJson(res, 200, {
        exportedAt: new Date().toISOString(),
        products: await listProducts({ includeInactive: true }),
        orders: await listOrders(),
      });
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
      product.history = [productHistoryEntry("Produto criado", "Cadastro realizado pelo painel admin.")];
      await saveProduct(product);
      sendJson(res, 201, { product });
      return true;
    }

    const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (productMatch && req.method === "PUT") {
      const products = await listProducts({ includeInactive: true });
      const id = decodeURIComponent(productMatch[1]);
      const currentProduct = products.find((product) => product.id === id);
      if (!currentProduct) throw new Error("Produto não encontrado.");

      const product = normalizeProduct(await readBody(req), id);
      const history = Array.isArray(currentProduct.history) ? [...currentProduct.history] : [];
      history.push(productHistoryEntry("Produto atualizado", "Cadastro alterado pelo painel admin."));
      product.history = history;
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
      const nextStatus = String(body.status || order.status);
      const nextDeadline = String(body.deadline || "");
      const nextNotes = String(body.internalNotes || "");
      const history = Array.isArray(order.history) ? [...order.history] : [];
      const changes = [];
      if (nextStatus !== order.status) changes.push(`Status: ${order.status || "novo"} -> ${nextStatus}`);
      if (nextDeadline !== String(order.deadline || "")) {
        changes.push(`Prazo: ${order.deadline ? order.deadline : "a combinar"} -> ${nextDeadline || "a combinar"}`);
      }
      if (nextNotes !== String(order.internalNotes || "")) changes.push("Observação interna atualizada");
      if (changes.length > 0) {
        history.push({
          at: new Date().toISOString(),
          title: "Pedido atualizado",
          detail: changes.join(" | "),
        });
      }

      const nextOrder = {
        ...order,
        status: nextStatus,
        deadline: nextDeadline,
        deliveryMethod: String(body.deliveryMethod || order.deliveryMethod || ""),
        internalNotes: nextNotes,
        updatedAt: new Date().toISOString(),
        history,
      };
      await saveOrder(nextOrder);
      sendJson(res, 200, { order: nextOrder });
      return true;
    }

    if (orderMatch && req.method === "DELETE") {
      await removeOrder(decodeURIComponent(orderMatch[1]));
      sendJson(res, 200, { ok: true });
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
  SECURITY_HEADERS,
};
