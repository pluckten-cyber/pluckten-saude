const loginView = document.querySelector("[data-login-view]");
const adminView = document.querySelector("[data-admin-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const productForm = document.querySelector("[data-product-form]");
const productMessage = document.querySelector("[data-product-message]");
const productList = document.querySelector("[data-product-list]");
const orderList = document.querySelector("[data-order-list]");
const orderSearch = document.querySelector("[data-order-search]");
const orderFilter = document.querySelector("[data-order-filter]");
const imagePreview = document.querySelector("[data-image-preview]");
const statOrders = document.querySelector("[data-stat-orders]");
const statProducts = document.querySelector("[data-stat-products]");
const statOpen = document.querySelector("[data-stat-open]");
const statRevenue = document.querySelector("[data-stat-revenue]");

let products = [];
let orders = [];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const availabilityLabels = {
  in_stock: "Pronta entrega",
  on_request: "Sob consulta",
  unavailable: "Indisponível",
};

const orderStatuses = ["novo", "confirmado", "separando", "enviado", "entregue", "cancelado"];

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

function getAvailability(product) {
  return availabilityLabels[product.availability] ? product.availability : "in_stock";
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
  statRevenue.textContent = formatPrice(revenue);
}

function renderProducts() {
  if (products.length === 0) {
    productList.innerHTML = '<div class="empty-state">Nenhum produto cadastrado.</div>';
    return;
  }

  productList.innerHTML = products
    .map((product) => {
      const availability = getAvailability(product);
      return `
        <article class="admin-product-card">
          <div class="admin-product-head">
            <div>
              <strong>${escapeHtml(product.name)}</strong>
              <div class="product-card-pills">
                <span class="pill">${product.active ? "Ativo" : "Oculto"}</span>
                <span class="pill">${availabilityLabels[availability]}</span>
              </div>
            </div>
            <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
          </div>
          <p>${escapeHtml(product.category)} • ${escapeHtml(product.pack)} • estoque ${Number(product.stock || 0)}</p>
          ${product.brand || product.sku ? `<p>${escapeHtml(product.brand || "Sem marca")} • ${escapeHtml(product.sku || "sem SKU")}</p>` : ""}
          <p>${formatPrice(product.price)}</p>
          <div class="mini-actions">
            <button class="mini-button" type="button" data-edit-product="${escapeHtml(product.id)}">Editar</button>
            <button class="mini-button danger" type="button" data-delete-product="${escapeHtml(product.id)}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
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
    return matchesQuery && matchesStatus;
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
          <p><strong>Cliente:</strong> ${escapeHtml(customer.name)} • ${escapeHtml(customer.phone)}</p>
          <p><strong>Entrega:</strong> ${escapeHtml(customer.deliveryPreference || order.deliveryMethod || "A combinar")}</p>
          <p><strong>Pagamento:</strong> ${escapeHtml(customer.paymentPreference || "A combinar")}</p>
          <p><strong>Endereço/cidade:</strong> ${escapeHtml(customer.address || "A combinar")}</p>
          ${order.deadline ? `<p><strong>Prazo:</strong> ${formatDate(order.deadline)}</p>` : ""}
          <ol class="order-items">
            ${(order.items || [])
              .map((item) => `<li>${Number(item.quantity || 1)}x ${escapeHtml(item.name)} - ${formatPrice(item.subtotal)}</li>`)
              .join("")}
          </ol>
          <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
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
          <div class="mini-actions">
            <button class="mini-button" type="button" data-save-order="${escapeHtml(order.id)}">Salvar pedido</button>
            <button class="mini-button" type="button" data-deliver-order="${escapeHtml(order.id)}">Marcar entregue</button>
            <button class="mini-button" type="button" data-copy-whatsapp="${escapeHtml(order.id)}">Copiar WhatsApp</button>
            <a class="mini-button" href="https://wa.me/${escapeHtml(String(customer.phone || "").replace(/\D/g, ""))}" target="_blank" rel="noreferrer">Abrir WhatsApp</a>
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
    price: Number(formData.get("price")),
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
  productForm.elements.price.value = product.price;
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

  return [
    `Olá, ${customer.name || "tudo bem"}! Aqui é da Pluckten Saúde.`,
    `Recebemos o pedido ${order.id}.`,
    "",
    "Itens:",
    items,
    "",
    `Total estimado: ${formatPrice(order.total)}`,
    `Entrega: ${delivery}`,
    `Pagamento: ${payment}${deadline}`,
    "",
    "Vou confirmar estoque, marca, validade e entrega por aqui.",
  ].join("\n");
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

document.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit-product]")?.dataset.editProduct;
  const deleteId = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
  const orderId = event.target.closest("[data-save-order]")?.dataset.saveOrder;
  const deliverId = event.target.closest("[data-deliver-order]")?.dataset.deliverOrder;
  const copyId = event.target.closest("[data-copy-whatsapp]")?.dataset.copyWhatsapp;

  if (event.target.closest("[data-new-product]")) {
    resetProductForm();
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
});

checkSession().catch(() => showLogin());
