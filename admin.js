const loginView = document.querySelector("[data-login-view]");
const adminView = document.querySelector("[data-admin-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const productForm = document.querySelector("[data-product-form]");
const productMessage = document.querySelector("[data-product-message]");
const productList = document.querySelector("[data-product-list]");
const productSearch = document.querySelector("[data-product-search]");
const productCategoryFilter = document.querySelector("[data-product-category-filter]");
const productStockFilter = document.querySelector("[data-product-stock-filter]");
const orderList = document.querySelector("[data-order-list]");
const orderSearch = document.querySelector("[data-order-search]");
const orderFilter = document.querySelector("[data-order-filter]");
const orderQuickFilters = document.querySelectorAll("[data-order-quick-filter]");
const adminAlerts = document.querySelector("[data-admin-alerts]");
const imagePreview = document.querySelector("[data-image-preview]");
const variantList = document.querySelector("[data-variant-list]");
const statOrders = document.querySelector("[data-stat-orders]");
const statProducts = document.querySelector("[data-stat-products]");
const statOpen = document.querySelector("[data-stat-open]");
const statRevenue = document.querySelector("[data-stat-revenue]");
const statToday = document.querySelector("[data-stat-today]");
const statOverdue = document.querySelector("[data-stat-overdue]");
const statLowStock = document.querySelector("[data-stat-low-stock]");
const statExpiring = document.querySelector("[data-stat-expiring]");
const exportOrdersButton = document.querySelector("[data-export-orders]");
const exportBackupButton = document.querySelector("[data-export-backup]");

let products = [];
let orders = [];
let quickOrderFilter = "";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const summaryCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const availabilityLabels = {
  in_stock: "Pronta entrega",
  on_request: "Sob consulta",
  unavailable: "Indisponível",
};

const orderStatuses = ["novo", "confirmado", "separando", "enviado", "entregue", "cancelado"];
const LOW_STOCK_LIMIT = 5;
const EXPIRING_DAYS = 120;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function formatPrice(value) {
  return currency.format(Number(value || 0));
}

function formatSummaryPrice(value) {
  return summaryCurrency.format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function dateFromInput(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function isOpenOrder(order) {
  return !["entregue", "cancelado"].includes(order.status);
}

function isOverdue(order) {
  const deadline = dateFromInput(order.deadline);
  if (!deadline || !isOpenOrder(order)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline < today;
}

function normalizePhoneForWhatsApp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getAvailability(product) {
  return availabilityLabels[product.availability] ? product.availability : "in_stock";
}

function getVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function productChoices(product) {
  return [
    { name: "Kit padrão", price: Number(product.price || 0), stock: Number(product.stock || 0), sku: product.sku || "" },
    ...getVariants(product).map((variant) => ({
      name: variant.name,
      price: Number(variant.price || 0),
      stock: Number(variant.stock || 0),
      sku: variant.sku || "",
    })),
  ];
}

function productDisplayPrice(product) {
  return Math.min(...productChoices(product).map((choice) => Number(choice.price || 0)));
}

function productTotalStock(product) {
  return productChoices(product).reduce((sum, choice) => sum + Number(choice.stock || 0), 0);
}

function hasLowStock(product) {
  return getAvailability(product) !== "unavailable" && productTotalStock(product) <= LOW_STOCK_LIMIT;
}

function daysUntil(value) {
  const date = dateFromInput(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function hasExpiringDate(product) {
  const days = daysUntil(product.validity);
  return days !== null && days >= 0 && days <= EXPIRING_DAYS;
}

function hasMissingCompliance(product) {
  return !String(product.anvisa || "").trim() || !String(product.batch || "").trim();
}

function productIssueTags(product) {
  const tags = [];
  if (hasLowStock(product)) tags.push("Estoque baixo");
  if (hasMissingCompliance(product)) tags.push("Conferir lote/ANVISA");
  if (hasExpiringDate(product)) tags.push("Validade próxima");
  if (product.active === false) tags.push("Oculto");
  return tags;
}

function productMargin(product) {
  const cost = Number(product.cost || 0);
  const price = Number(product.price || 0);
  if (!cost || !price || price < cost) return null;
  const value = price - cost;
  const percent = (value / price) * 100;
  return { value, percent };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro na solicitação.");
  return data;
}

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function showAdmin() {
  loginView.hidden = true;
  adminView.hidden = false;
}

function showLogin() {
  loginView.hidden = false;
  adminView.hidden = true;
}

async function checkSession() {
  const data = await api("/api/admin/session");
  if (data.authed) {
    showAdmin();
    await loadDashboard();
  } else {
    showLogin();
  }
}

async function loadDashboard() {
  const [productData, orderData] = await Promise.all([
    api("/api/admin/products"),
    api("/api/admin/orders"),
  ]);
  products = productData.products || [];
  orders = orderData.orders || [];
  renderStats();
  renderProductFilters();
  renderAdminAlerts();
  renderProducts();
  renderOrders();
}

function renderStats() {
  const revenue = orders
    .filter((order) => order.status !== "cancelado")
    .reduce((sum, order) => sum + Number(order.total || 0), 0);

  statOrders.textContent = orders.length;
  statProducts.textContent = products.length;
  statOpen.textContent = orders.filter(isOpenOrder).length;
  statRevenue.textContent = formatSummaryPrice(revenue);
  statToday.textContent = orders.filter(isTodayOrder).length;
  statOverdue.textContent = orders.filter(isOverdue).length;
  statLowStock.textContent = products.filter(hasLowStock).length;
  statExpiring.textContent = products.filter((product) => hasExpiringDate(product) || hasMissingCompliance(product)).length;
}

function isTodayOrder(order) {
  if (!order.createdAt) return false;
  const created = new Date(order.createdAt);
  const today = new Date();
  return (
    created.getFullYear() === today.getFullYear() &&
    created.getMonth() === today.getMonth() &&
    created.getDate() === today.getDate()
  );
}

function renderProductFilters() {
  const current = productCategoryFilter.value;
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  productCategoryFilter.innerHTML = `
    <option value="">Todas</option>
    ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
  `;
  productCategoryFilter.value = categories.includes(current) ? current : "";
}

function renderAdminAlerts() {
  const overdue = orders.filter(isOverdue).length;
  const lowStock = products.filter(hasLowStock).slice(0, 4);
  const compliance = products.filter((product) => hasMissingCompliance(product) || hasExpiringDate(product)).slice(0, 4);
  const openOrders = orders.filter(isOpenOrder).length;

  const cards = [
    {
      title: overdue ? `${overdue} pedido${overdue > 1 ? "s" : ""} atrasado${overdue > 1 ? "s" : ""}` : "Prazos em dia",
      text: overdue ? "Revise os prazos em aberto antes de novas confirmações." : "Nenhum pedido aberto com prazo vencido.",
      tone: overdue ? "danger" : "",
    },
    {
      title: `${lowStock.length} alerta${lowStock.length === 1 ? "" : "s"} de estoque`,
      text: lowStock.length ? lowStock.map((product) => product.name).join(", ") : "Nenhum produto em estoque baixo.",
      tone: lowStock.length ? "warning" : "",
    },
    {
      title: `${compliance.length} conferência${compliance.length === 1 ? "" : "s"} pendente${compliance.length === 1 ? "" : "s"}`,
      text: compliance.length ? compliance.map((product) => product.name).join(", ") : "Lote, ANVISA e validade sem alertas principais.",
      tone: compliance.length ? "warning" : "",
    },
    {
      title: `${openOrders} pedido${openOrders === 1 ? "" : "s"} em aberto`,
      text: "Use os filtros rápidos para priorizar atendimento, separação e envio.",
      tone: "",
    },
  ];

  adminAlerts.innerHTML = cards
    .map(
      (card) => `
        <article class="${card.tone}">
          <strong>${escapeHtml(card.title)}</strong>
          <p>${escapeHtml(card.text)}</p>
        </article>
      `,
    )
    .join("");
}

function filteredProducts() {
  const query = productSearch.value.trim().toLowerCase();
  const category = productCategoryFilter.value;
  const filter = productStockFilter.value;

  return products.filter((product) => {
    const searchable = [
      product.name,
      product.category,
      product.brand,
      product.sku,
      product.anvisa,
      product.batch,
      ...getVariants(product).flatMap((variant) => [variant.name, variant.sku]),
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !query || searchable.includes(query);
    const matchesCategory = !category || product.category === category;
    const matchesFilter =
      !filter ||
      (filter === "low" && hasLowStock(product)) ||
      (filter === "missing" && hasMissingCompliance(product)) ||
      (filter === "expiring" && hasExpiringDate(product)) ||
      (filter === "hidden" && product.active === false);

    return matchesQuery && matchesCategory && matchesFilter;
  });
}

function renderProducts() {
  const visibleProducts = filteredProducts();

  if (products.length === 0) {
    productList.innerHTML = '<div class="empty-state">Nenhum produto cadastrado.</div>';
    return;
  }

  if (visibleProducts.length === 0) {
    productList.innerHTML = '<div class="empty-state">Nenhum produto encontrado com esse filtro.</div>';
    return;
  }

  productList.innerHTML = visibleProducts
    .map((product) => {
      const availability = getAvailability(product);
      const variants = getVariants(product);
      const issueTags = productIssueTags(product);
      const totalStock = productTotalStock(product);
      const validityLabel = product.validity ? formatDate(product.validity) : "Sem validade";
      const margin = productMargin(product);
      return `
        <article class="admin-product-card">
          <div class="admin-product-head">
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div>
              <strong>${escapeHtml(product.name)}</strong>
              <div class="product-card-pills">
                <span class="pill">${product.active ? "Ativo" : "Oculto"}</span>
                <span class="pill">${availabilityLabels[availability]}</span>
                ${issueTags.map((tag) => `<span class="pill warning">${escapeHtml(tag)}</span>`).join("")}
              </div>
            </div>
          </div>
          <div class="admin-product-meta">
            <p><strong>Categoria:</strong> ${escapeHtml(product.category)}</p>
            <p><strong>Embalagem:</strong> ${escapeHtml(product.pack)}</p>
            <p><strong>Estoque total:</strong> ${totalStock}</p>
            <p><strong>Validade:</strong> ${escapeHtml(validityLabel)}</p>
            <p><strong>Margem:</strong> ${margin ? `${formatPrice(margin.value)} (${margin.percent.toFixed(0)}%)` : "Não informada"}</p>
          </div>
          ${variants.length ? `<p>${variants.length} variação${variants.length > 1 ? "ões" : ""} cadastrada${variants.length > 1 ? "s" : ""}</p>` : ""}
          ${product.brand || product.sku ? `<p>${escapeHtml(product.brand || "Sem marca")} • ${escapeHtml(product.sku || "sem SKU")}</p>` : ""}
          <p>${variants.length ? "A partir de " : ""}${formatPrice(productDisplayPrice(product))}</p>
          ${renderProductHistory(product)}
          <div class="mini-actions">
            <button class="mini-button" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button>
            <button class="mini-button danger" type="button" data-delete-product="${escapeHtml(product.id)}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}
function variantRow(variant = {}) {
  return `
    <article class="variant-row">
      <label class="admin-field">
        Nome/tamanho
        <input data-variant-name value="${escapeHtml(variant.name || "")}" placeholder="Ex.: 5 cm x 10 m">
      </label>
      <label class="admin-field">
        Preço
        <input data-variant-price type="number" min="0" step="0.01" value="${escapeHtml(variant.price ?? "")}">
      </label>
      <label class="admin-field">
        Estoque
        <input data-variant-stock type="number" min="0" step="1" value="${escapeHtml(variant.stock ?? 0)}">
      </label>
      <label class="admin-field">
        SKU
        <input data-variant-sku value="${escapeHtml(variant.sku || "")}" placeholder="Opcional">
      </label>
      <button class="mini-button danger" type="button" data-remove-variant>Remover</button>
    </article>
  `;
}

function renderVariantRows(variants = []) {
  variantList.innerHTML = variants.map((variant) => variantRow(variant)).join("");
}

function variantPayload() {
  return [...variantList.querySelectorAll(".variant-row")]
    .map((row) => ({
      name: row.querySelector("[data-variant-name]").value,
      price: Number(row.querySelector("[data-variant-price]").value),
      stock: Number(row.querySelector("[data-variant-stock]").value),
      sku: row.querySelector("[data-variant-sku]").value,
    }))
    .filter((variant) => variant.name.trim() && Number.isFinite(variant.price) && variant.price >= 0);
}

function filteredOrders() {
  const query = orderSearch.value.trim().toLowerCase();
  const status = orderFilter.value;

  return orders.filter((order) => {
    const customer = order.customer || {};
    const searchable = [order.id, customer.name, customer.phone, customer.email, customer.document]
      .join(" ")
      .toLowerCase();
    const matchesQuery = !query || searchable.includes(query);
    const matchesStatus = !status || order.status === status;
    const matchesQuick =
      !quickOrderFilter ||
      (quickOrderFilter === "open" && isOpenOrder(order)) ||
      (quickOrderFilter === "overdue" && isOverdue(order)) ||
      (quickOrderFilter === "done" && !isOpenOrder(order));
    return matchesQuery && matchesStatus && matchesQuick;
  });
}

function renderOrders() {
  const visibleOrders = filteredOrders();

  if (orders.length === 0) {
    orderList.innerHTML = '<div class="empty-state">Nenhum pedido recebido ainda.</div>';
    return;
  }

  if (visibleOrders.length === 0) {
    orderList.innerHTML = '<div class="empty-state">Nenhum pedido encontrado com esse filtro.</div>';
    return;
  }

  orderList.innerHTML = visibleOrders
    .map((order) => {
      const customer = order.customer || {};
      const overdue = isOverdue(order);
      const phone = normalizePhoneForWhatsApp(customer.phone);
      const whatsappHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(order))}` : "#";
      return `
        <article class="order-card ${overdue ? "is-overdue" : ""}">
          <div class="order-head">
            <div>
              <strong>${escapeHtml(order.id)}</strong>
              <span>${new Date(order.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            <div class="status-stack">
              ${overdue ? '<span class="pill overdue">Prazo vencido</span>' : ""}
              <span class="pill">${escapeHtml(order.status || "novo")}</span>
            </div>
          </div>
          <div class="order-summary-line">
            <span><strong>Cliente:</strong> ${escapeHtml(customer.name)} â€¢ ${escapeHtml(customer.phone)}</span>
            <span><strong>Total:</strong> ${formatPrice(order.total)}</span>
          </div>
          <div class="order-info-grid">
            <p><strong>Entrega:</strong> ${escapeHtml(customer.deliveryPreference || order.deliveryMethod || "A combinar")}</p>
            <p><strong>Pagamento:</strong> ${escapeHtml(customer.paymentPreference || "A combinar")}</p>
            <p><strong>Endereço/cidade:</strong> ${escapeHtml(customer.address || "A combinar")}</p>
            <p><strong>Prazo:</strong> ${order.deadline ? formatDate(order.deadline) : "A combinar"}</p>
          </div>
          <ol class="order-items">
            ${(order.items || [])
              .map((item) => `<li>${Number(item.quantity || 1)}x ${escapeHtml(item.name)} - ${formatPrice(item.subtotal)}</li>`)
              .join("")}
          </ol>
          <div class="order-actions">
            <label class="admin-field">
              Status
              <select data-order-status="${escapeHtml(order.id)}">
                ${orderStatuses
                  .map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="admin-field">
              Prazo
              <input type="date" value="${escapeHtml(order.deadline || "")}" data-order-deadline="${escapeHtml(order.id)}">
            </label>
            <label class="admin-field">
              Observação interna
              <textarea rows="2" data-order-notes="${escapeHtml(order.id)}">${escapeHtml(order.internalNotes || "")}</textarea>
            </label>
          </div>
          ${renderOrderHistory(order)}
          <div class="mini-actions">
            <button class="mini-button" type="button" data-save-order="${escapeHtml(order.id)}">Salvar pedido</button>
            <button class="mini-button" type="button" data-deliver-order="${escapeHtml(order.id)}">Marcar entregue</button>
            <button class="mini-button" type="button" data-copy-whatsapp="${escapeHtml(order.id)}">Copiar WhatsApp</button>
            <a class="mini-button" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            <button class="mini-button danger" type="button" data-delete-order="${escapeHtml(order.id)}">Excluir pedido</button>
          </div>
        </article>
      `;
    })
    .join("");
}

async function fileToDataUrl(file) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function productPayload() {
  const formData = new FormData(productForm);
  const imageFile = productForm.elements.imageFile.files[0];
  const imageData = await fileToDataUrl(imageFile);

  return {
    id: formData.get("id"),
    name: formData.get("name"),
    category: formData.get("category"),
    pack: formData.get("pack"),
    brand: formData.get("brand"),
    sku: formData.get("sku"),
    description: formData.get("description"),
    usage: formData.get("usage"),
    salesNotes: formData.get("salesNotes"),
    variants: variantPayload(),
    price: Number(formData.get("price")),
    cost: Number(formData.get("cost") || 0),
    stock: Number(formData.get("stock")),
    anvisa: formData.get("anvisa"),
    availability: formData.get("availability"),
    batch: formData.get("batch"),
    validity: formData.get("validity"),
    image: imageData || formData.get("image") || "assets/hero-kit.png",
    active: productForm.elements.active.checked,
  };
}

function setImagePreview(source) {
  if (!source) {
    imagePreview.hidden = true;
    imagePreview.innerHTML = "";
    return;
  }

  imagePreview.hidden = false;
  imagePreview.innerHTML = `
    <span>Prévia da foto</span>
    <img src="${escapeHtml(source)}" alt="Prévia do produto">
  `;
}

function fillProduct(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.name.value = product.name;
  productForm.elements.category.value = product.category;
  productForm.elements.pack.value = product.pack;
  productForm.elements.brand.value = product.brand || "";
  productForm.elements.sku.value = product.sku || "";
  productForm.elements.description.value = product.description;
  productForm.elements.usage.value = product.usage || "";
  productForm.elements.salesNotes.value = product.salesNotes || "";
  renderVariantRows(product.variants || []);
  productForm.elements.price.value = product.price;
  productForm.elements.cost.value = product.cost || "";
  productForm.elements.stock.value = product.stock ?? 0;
  productForm.elements.anvisa.value = product.anvisa || "";
  productForm.elements.availability.value = getAvailability(product);
  productForm.elements.batch.value = product.batch || "";
  productForm.elements.validity.value = product.validity || "";
  productForm.elements.image.value = product.image;
  productForm.elements.imageFile.value = "";
  productForm.elements.active.checked = product.active !== false;
  setImagePreview(product.image);
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.availability.value = "in_stock";
  productForm.elements.active.checked = true;
  renderVariantRows();
  setImagePreview("");
  setMessage(productMessage, "");
}

function orderMessage(order) {
  const customer = order.customer || {};
  const items = (order.items || [])
    .map((item) => `- ${item.quantity}x ${item.name}: ${formatPrice(item.subtotal)}`)
    .join("\n");
  const deadline = order.deadline ? `\nPrazo combinado: ${formatDate(order.deadline)}` : "";
  const delivery = customer.deliveryPreference || order.deliveryMethod || "A combinar";
  const payment = customer.paymentPreference || "A combinar";
  const address = customer.address ? `\nEndereço/cidade: ${customer.address}` : "";
  const notes = customer.notes ? `\nObservações do cliente: ${customer.notes}` : "";

  return [
    `Olá, ${customer.name || "tudo bem"}! Aqui é da Pluckten Distribuidora Med.`,
    `Recebemos o pedido ${order.id}.`,
    "",
    "Itens:",
    items,
    "",
    `Total estimado: ${formatPrice(order.total)}`,
    `Entrega: ${delivery}`,
    `Pagamento: ${payment}${deadline}${address}${notes}`,
    "",
    "Vou confirmar estoque, marca, validade, prazo e forma de entrega por aqui.",
  ].join("\n");
}

function renderOrderHistory(order) {
  const history = Array.isArray(order.history) ? order.history : [];
  if (history.length === 0) return "";

  return `
    <details class="order-history">
      <summary>Histórico do pedido</summary>
      <ol>
        ${history
          .slice()
          .reverse()
          .map(
            (entry) => `
              <li>
                <strong>${escapeHtml(entry.title || "Atualização")}</strong>
                <span>${new Date(entry.at || order.updatedAt || order.createdAt).toLocaleString("pt-BR")}</span>
                ${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}
              </li>
            `,
          )
          .join("")}
      </ol>
    </details>
  `;
}

function renderProductHistory(product) {
  const history = Array.isArray(product.history) ? product.history : [];
  if (history.length === 0) return "";

  return `
    <details class="order-history product-history">
      <summary>Histórico do produto</summary>
      <ol>
        ${history
          .slice()
          .reverse()
          .map(
            (entry) => `
              <li>
                <strong>${escapeHtml(entry.title || "Atualização")}</strong>
                <span>${new Date(entry.at || Date.now()).toLocaleString("pt-BR")}</span>
                ${entry.detail ? `<p>${escapeHtml(entry.detail)}</p>` : ""}
              </li>
            `,
          )
          .join("")}
      </ol>
    </details>
  `;
}

async function copyOrderMessage(orderId) {
  const order = orders.find((item) => item.id === orderId);
  if (!order) return;

  await navigator.clipboard.writeText(orderMessage(order));
}

async function updateOrder(orderId, patch = {}) {
  await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: document.querySelector(`[data-order-status="${cssEscape(orderId)}"]`).value,
      deadline: document.querySelector(`[data-order-deadline="${cssEscape(orderId)}"]`).value,
      internalNotes: document.querySelector(`[data-order-notes="${cssEscape(orderId)}"]`).value,
      ...patch,
    }),
  });
  await loadDashboard();
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportOrdersCsv() {
  const rows = [
    ["Pedido", "Criado em", "Status", "Cliente", "Telefone", "Email", "Entrega", "Pagamento", "Prazo", "Total", "Itens"],
    ...orders.map((order) => {
      const customer = order.customer || {};
      const items = (order.items || [])
        .map((item) => `${item.quantity}x ${item.name}`)
        .join(" | ");
      return [
        order.id,
        order.createdAt ? new Date(order.createdAt).toLocaleString("pt-BR") : "",
        order.status || "",
        customer.name || "",
        customer.phone || "",
        customer.email || "",
        customer.deliveryPreference || order.deliveryMethod || "",
        customer.paymentPreference || "",
        order.deadline ? formatDate(order.deadline) : "",
        Number(order.total || 0).toFixed(2).replace(".", ","),
        items,
      ];
    }),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  downloadBlob(`pedidos-pluckten-${new Date().toISOString().slice(0, 10)}.csv`, blob);
}

async function exportBackupJson() {
  const backup = await api("/api/admin/backup");
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  downloadBlob(`backup-pluckten-${new Date().toISOString().slice(0, 10)}.json`, blob);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Entrando...");

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: loginForm.elements.password.value }),
    });
    showAdmin();
    await loadDashboard();
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(productMessage, "Salvando...");

  try {
    const payload = await productPayload();
    const id = productForm.elements.id.value;
    await api(id ? `/api/admin/products/${encodeURIComponent(id)}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    setMessage(productMessage, "Produto salvo.");
    resetProductForm();
    await loadDashboard();
  } catch (error) {
    setMessage(productMessage, error.message, true);
  }
});

productForm.elements.imageFile.addEventListener("change", async () => {
  const imageFile = productForm.elements.imageFile.files[0];
  setImagePreview(await fileToDataUrl(imageFile));
});

productForm.elements.image.addEventListener("input", () => {
  if (!productForm.elements.imageFile.files[0]) {
    setImagePreview(productForm.elements.image.value);
  }
});

orderSearch.addEventListener("input", renderOrders);
orderFilter.addEventListener("change", renderOrders);
productSearch.addEventListener("input", renderProducts);
productCategoryFilter.addEventListener("change", renderProducts);
productStockFilter.addEventListener("change", renderProducts);
exportOrdersButton.addEventListener("click", exportOrdersCsv);
exportBackupButton.addEventListener("click", () => {
  exportBackupJson().catch((error) => alert(error.message));
});
orderQuickFilters.forEach((button) => {
  button.addEventListener("click", () => {
    quickOrderFilter = button.dataset.orderQuickFilter || "";
    orderQuickFilters.forEach((item) => item.classList.toggle("is-active", item === button));
    renderOrders();
  });
});

document.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit-product]")?.dataset.editProduct;
  const deleteId = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
  const orderId = event.target.closest("[data-save-order]")?.dataset.saveOrder;
  const deliverId = event.target.closest("[data-deliver-order]")?.dataset.deliverOrder;
  const copyId = event.target.closest("[data-copy-whatsapp]")?.dataset.copyWhatsapp;
  const deleteOrderId = event.target.closest("[data-delete-order]")?.dataset.deleteOrder;

  if (event.target.closest("[data-new-product]")) {
    resetProductForm();
  }

  if (event.target.closest("[data-add-variant]")) {
    variantList.insertAdjacentHTML("beforeend", variantRow());
  }

  if (event.target.closest("[data-remove-variant]")) {
    event.target.closest(".variant-row")?.remove();
  }

  if (event.target.closest("[data-refresh]")) {
    await loadDashboard();
  }

  if (event.target.closest("[data-logout]")) {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    showLogin();
  }

  if (editId) {
    const product = products.find((item) => item.id === editId);
    if (product) fillProduct(product);
  }

  if (deleteId && confirm("Excluir este produto do catálogo?")) {
    await api(`/api/admin/products/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    await loadDashboard();
  }

  if (orderId) {
    await updateOrder(orderId);
  }

  if (deliverId) {
    await updateOrder(deliverId, { status: "entregue" });
  }

  if (copyId) {
    try {
      await copyOrderMessage(copyId);
      event.target.textContent = "Copiado";
      setTimeout(() => {
        event.target.textContent = "Copiar WhatsApp";
      }, 1200);
    } catch (error) {
      alert("Não consegui copiar automaticamente. Abra o WhatsApp e envie a mensagem manualmente.");
    }
  }
  if (deleteOrderId && confirm("Excluir este pedido do painel? Essa ação não pode ser desfeita.")) {
    await api(`/api/admin/orders/${encodeURIComponent(deleteOrderId)}`, { method: "DELETE" });
    await loadDashboard();
  }
});

checkSession().catch(() => showLogin());
