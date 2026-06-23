const loginView = document.querySelector("[data-login-view]");
const adminView = document.querySelector("[data-admin-view]");
const loginForm = document.querySelector("[data-login-form]");
const loginMessage = document.querySelector("[data-login-message]");
const productForm = document.querySelector("[data-product-form]");
const productMessage = document.querySelector("[data-product-message]");
const productList = document.querySelector("[data-product-list]");
const orderList = document.querySelector("[data-order-list]");
const statOrders = document.querySelector("[data-stat-orders]");
const statProducts = document.querySelector("[data-stat-products]");
const statOpen = document.querySelector("[data-stat-open]");

let products = [];
let orders = [];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function formatPrice(value) {
  return currency.format(Number(value || 0));
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
  statOrders.textContent = orders.length;
  statProducts.textContent = products.length;
  statOpen.textContent = orders.filter((order) => !["entregue", "cancelado"].includes(order.status)).length;
}

function renderProducts() {
  if (products.length === 0) {
    productList.innerHTML = '<div class="empty-state">Nenhum produto cadastrado.</div>';
    return;
  }

  productList.innerHTML = products
    .map(
      (product) => `
        <article class="admin-product-card">
          <div class="admin-product-head">
            <div>
              <strong>${product.name}</strong>
              <span class="pill">${product.active ? "Ativo" : "Oculto"}</span>
            </div>
            <img src="${product.image}" alt="${product.name}">
          </div>
          <p>${product.category} • ${product.pack} • estoque ${product.stock ?? 0}</p>
          <p>${formatPrice(product.price)}</p>
          <div class="mini-actions">
            <button class="mini-button" type="button" data-edit-product="${product.id}">Editar</button>
            <button class="mini-button danger" type="button" data-delete-product="${product.id}">Excluir</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderOrders() {
  if (orders.length === 0) {
    orderList.innerHTML = '<div class="empty-state">Nenhum pedido recebido ainda.</div>';
    return;
  }

  orderList.innerHTML = orders
    .map(
      (order) => `
        <article class="order-card">
          <div class="order-head">
            <div>
              <strong>${order.id}</strong>
              <span>${new Date(order.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            <span class="pill">${order.status}</span>
          </div>
          <p><strong>Cliente:</strong> ${order.customer.name} • ${order.customer.phone}</p>
          <p><strong>Entrega:</strong> ${order.customer.address || "A combinar"}</p>
          <ol class="order-items">
            ${order.items
              .map((item) => `<li>${item.quantity}x ${item.name} - ${formatPrice(item.subtotal)}</li>`)
              .join("")}
          </ol>
          <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
          <div class="order-actions">
            <label class="admin-field">
              Status
              <select data-order-status="${order.id}">
                ${["novo", "confirmado", "separando", "enviado", "entregue", "cancelado"]
                  .map((status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`)
                  .join("")}
              </select>
            </label>
            <label class="admin-field">
              Prazo
              <input type="date" value="${order.deadline || ""}" data-order-deadline="${order.id}">
            </label>
            <label class="admin-field">
              Observação interna
              <textarea rows="2" data-order-notes="${order.id}">${order.internalNotes || ""}</textarea>
            </label>
          </div>
          <div class="mini-actions">
            <button class="mini-button" type="button" data-save-order="${order.id}">Salvar pedido</button>
            <a class="mini-button" href="https://wa.me/${order.customer.phone.replace(/\D/g, "")}" target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </article>
      `,
    )
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
    description: formData.get("description"),
    price: Number(formData.get("price")),
    stock: Number(formData.get("stock")),
    image: imageData || formData.get("image") || "assets/hero-kit.png",
    active: productForm.elements.active.checked,
  };
}

function fillProduct(product) {
  productForm.elements.id.value = product.id;
  productForm.elements.name.value = product.name;
  productForm.elements.category.value = product.category;
  productForm.elements.pack.value = product.pack;
  productForm.elements.description.value = product.description;
  productForm.elements.price.value = product.price;
  productForm.elements.stock.value = product.stock ?? 0;
  productForm.elements.image.value = product.image;
  productForm.elements.active.checked = product.active !== false;
  productForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProductForm() {
  productForm.reset();
  productForm.elements.id.value = "";
  productForm.elements.active.checked = true;
  setMessage(productMessage, "");
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

document.addEventListener("click", async (event) => {
  const editId = event.target.closest("[data-edit-product]")?.dataset.editProduct;
  const deleteId = event.target.closest("[data-delete-product]")?.dataset.deleteProduct;
  const orderId = event.target.closest("[data-save-order]")?.dataset.saveOrder;

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

  if (deleteId) {
    await api(`/api/admin/products/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
    await loadDashboard();
  }

  if (orderId) {
    await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: document.querySelector(`[data-order-status="${orderId}"]`).value,
        deadline: document.querySelector(`[data-order-deadline="${orderId}"]`).value,
        internalNotes: document.querySelector(`[data-order-notes="${orderId}"]`).value,
      }),
    });
    await loadDashboard();
  }
});

checkSession().catch(() => showLogin());
