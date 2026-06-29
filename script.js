const WHATSAPP_NUMBER = "5514998715711";

let products = [];
let selectedProductId = "";
const cart = new Map();
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const availabilityLabels = {
  in_stock: "Pronta entrega",
  on_request: "Sob consulta",
  unavailable: "Indisponível",
};

const productGrid = document.querySelector("[data-product-grid]");
const productSearch = document.querySelector("[data-product-search]");
const categoryFilter = document.querySelector("[data-category-filter]");
const clearFiltersButton = document.querySelector("[data-clear-filters]");
const productModal = document.querySelector("[data-product-modal]");
const detailImage = document.querySelector("[data-detail-image]");
const detailCategory = document.querySelector("[data-detail-category]");
const detailName = document.querySelector("[data-detail-name]");
const detailDescription = document.querySelector("[data-detail-description]");
const detailGrid = document.querySelector("[data-detail-grid]");
const detailNotes = document.querySelector("[data-detail-notes]");
const detailPrice = document.querySelector("[data-detail-price]");
const detailAdd = document.querySelector("[data-detail-add]");
const cartPanel = document.querySelector("[data-cart-panel]");
const cartItems = document.querySelector("[data-cart-items]");
const cartEmpty = document.querySelector("[data-cart-empty]");
const cartFooter = document.querySelector(".cart-footer");
const cartTotal = document.querySelector("[data-cart-total]");
const cartCount = document.querySelector("[data-cart-count]");
const whatsappLinks = document.querySelectorAll("[data-whatsapp-link]");
const checkoutModal = document.querySelector("[data-checkout-modal]");
const checkoutForm = document.querySelector("[data-checkout-form]");
const checkoutStatus = document.querySelector("[data-checkout-status]");
const statusForm = document.querySelector("[data-status-form]");
const statusResult = document.querySelector("[data-status-result]");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function getAvailability(product) {
  return availabilityLabels[product.availability] ? product.availability : "in_stock";
}

function availabilityBadge(product) {
  const availability = getAvailability(product);
  return `<span class="stock-badge ${availability}">${availabilityLabels[availability]}</span>`;
}

function getWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function orderWhatsAppMessage(order) {
  const items = (order.items || [])
    .map((item) => `- ${item.quantity}x ${item.name}: ${formatPrice(item.subtotal)}`)
    .join("\n");
  const customer = order.customer || {};

  return [
    "Olá, Pluckten Saúde! Acabei de enviar uma cotação pelo site.",
    `Pedido: ${order.id}`,
    `Nome: ${customer.name || ""}`,
    `WhatsApp: ${customer.phone || ""}`,
    "",
    "Itens:",
    items,
    "",
    `Total estimado: ${formatPrice(order.total)}`,
    "Podem confirmar estoque, prazo e pagamento?",
  ].join("\n");
}

function setContactLinks() {
  whatsappLinks.forEach((link) => {
    link.href = getWhatsAppUrl("Olá, Pluckten Saúde! Quero saber mais sobre os produtos disponíveis.");
  });
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error("Não foi possível carregar os produtos.");
    const data = await response.json();
    products = data.products || [];
    renderFilters();
    renderProducts();
    renderCart();
  } catch (error) {
    productGrid.innerHTML = `
      <div class="empty-state">
        <strong>Não foi possível carregar o catálogo.</strong>
        <p>Confira se o servidor da Pluckten Saúde está rodando.</p>
      </div>
    `;
  }
}

function renderFilters() {
  const currentCategory = categoryFilter.value;
  const categories = [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  categoryFilter.innerHTML = `
    <option value="">Todas as categorias</option>
    ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}
  `;
  categoryFilter.value = categories.includes(currentCategory) ? currentCategory : "";
}

function filteredProducts() {
  const query = productSearch.value.trim().toLowerCase();
  const category = categoryFilter.value;

  return products.filter((product) => {
    const searchable = [
      product.name,
      product.description,
      product.category,
      product.brand,
      product.sku,
      product.anvisa,
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !query || searchable.includes(query);
    const matchesCategory = !category || product.category === category;
    return matchesQuery && matchesCategory;
  });
}

function renderProducts() {
  const visibleProducts = filteredProducts();

  if (products.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-state">
        <strong>Catálogo em atualização.</strong>
        <p>Novos produtos aparecerão aqui assim que forem cadastrados.</p>
      </div>
    `;
    return;
  }

  if (visibleProducts.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-state">
        <strong>Nenhum produto encontrado.</strong>
        <p>Tente outra busca ou limpe os filtros para ver todo o catálogo.</p>
      </div>
    `;
    return;
  }

  productGrid.innerHTML = visibleProducts
    .map((product, index) => {
      const availability = getAvailability(product);
      const code = product.sku || `PLK-${String(index + 1).padStart(2, "0")}`;
      const disabled = availability === "unavailable" ? "disabled" : "";
      const stockText =
        availability === "on_request" ? "estoque sob consulta" : `estoque: ${Number(product.stock || 0)}`;

      return `
        <article class="product-card">
          <div class="product-image-shell">
            <img class="product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
          </div>
          <div class="product-body">
            <div class="product-meta">
              <span class="tag">${escapeHtml(product.category)}</span>
              <span class="product-code">${escapeHtml(code)}</span>
            </div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.description)}</p>
            <div class="product-badges">
              ${availabilityBadge(product)}
              ${product.brand ? `<span class="product-code">${escapeHtml(product.brand)}</span>` : ""}
              <span class="product-code">${escapeHtml(product.pack)} • ${escapeHtml(stockText)}</span>
            </div>
            <div class="product-footer">
              <span class="price">${formatPrice(product.price)}</span>
              <div class="product-actions">
                <button class="mini-button" type="button" data-view-product="${escapeHtml(product.id)}">
                  Detalhes
                </button>
                <button class="add-button" type="button" data-add-product="${escapeHtml(product.id)}" ${disabled}>
                  ${availability === "on_request" ? "Consultar" : "Adicionar"}
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function productDetails(product) {
  return [
    ["Marca", product.brand],
    ["SKU", product.sku],
    ["Embalagem", product.pack],
    ["Regularização / ANVISA", product.anvisa],
    ["Lote", product.batch],
    ["Validade", formatDate(product.validity)],
    ["Disponibilidade", availabilityLabels[getAvailability(product)]],
    ["Estoque", getAvailability(product) === "on_request" ? "Sob consulta" : Number(product.stock || 0)],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function productNotes(product) {
  return [
    ["Modo de uso / indicação", product.usage],
    ["Observação de venda", product.salesNotes],
  ].filter(([, value]) => value);
}

function openProductDetails(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  selectedProductId = id;
  detailImage.src = product.image;
  detailImage.alt = product.name;
  detailCategory.textContent = product.category || "Produto";
  detailName.textContent = product.name;
  detailDescription.textContent = product.description || "";
  detailPrice.textContent = formatPrice(product.price);
  detailGrid.innerHTML = productDetails(product)
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${escapeHtml(value)}</dd>
        </div>
      `,
    )
    .join("");
  const notes = productNotes(product);
  detailNotes.hidden = notes.length === 0;
  detailNotes.innerHTML = notes
    .map(
      ([label, value]) => `
        <article>
          <strong>${escapeHtml(label)}</strong>
          <p>${escapeHtml(value)}</p>
        </article>
      `,
    )
    .join("");
  detailAdd.disabled = getAvailability(product) === "unavailable";
  detailAdd.textContent = getAvailability(product) === "on_request" ? "Consultar" : "Adicionar";

  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
}

function closeProductDetails() {
  productModal.classList.remove("is-open");
  productModal.setAttribute("aria-hidden", "true");
  if (!cartPanel.classList.contains("is-open") && !checkoutModal.classList.contains("is-open")) {
    document.body.classList.remove("cart-open");
  }
}

function getCartSummary() {
  return [...cart.entries()].reduce(
    (summary, [id, quantity]) => {
      const product = products.find((item) => item.id === id);
      if (!product) return summary;

      summary.count += quantity;
      summary.total += product.price * quantity;
      return summary;
    },
    { count: 0, total: 0 },
  );
}

function cartPayload() {
  return [...cart.entries()].map(([id, quantity]) => ({ id, quantity }));
}

function renderCart() {
  const rows = [...cart.entries()]
    .map(([id, quantity]) => {
      const product = products.find((item) => item.id === id);
      if (!product) return "";

      return `
        <article class="cart-row">
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${formatPrice(product.price)} cada</p>
          </div>
          <div class="qty-control" aria-label="Quantidade de ${escapeHtml(product.name)}">
            <button type="button" data-decrease="${escapeHtml(id)}" aria-label="Diminuir">−</button>
            <span>${quantity}</span>
            <button type="button" data-increase="${escapeHtml(id)}" aria-label="Aumentar">+</button>
          </div>
        </article>
      `;
    })
    .join("");

  const summary = getCartSummary();
  cartItems.innerHTML = rows;
  cartCount.textContent = summary.count;
  cartTotal.textContent = formatPrice(summary.total);
  cartEmpty.hidden = summary.count > 0;
  cartFooter.hidden = summary.count === 0;
}

function addToCart(id) {
  const product = products.find((item) => item.id === id);
  if (!product || getAvailability(product) === "unavailable") return;
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
}

function updateQuantity(id, delta) {
  const nextQuantity = (cart.get(id) || 0) + delta;

  if (nextQuantity <= 0) {
    cart.delete(id);
  } else {
    cart.set(id, nextQuantity);
  }

  renderCart();
}

function openCart() {
  cartPanel.classList.add("is-open");
  cartPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
}

function closeCart() {
  cartPanel.classList.remove("is-open");
  cartPanel.setAttribute("aria-hidden", "true");
  if (!checkoutModal.classList.contains("is-open") && !productModal.classList.contains("is-open")) {
    document.body.classList.remove("cart-open");
  }
}

function openCheckout() {
  if (cart.size === 0) return;
  checkoutStatus.textContent = "";
  checkoutStatus.classList.remove("is-error", "is-success");
  checkoutModal.classList.add("is-open");
  checkoutModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
}

function closeCheckout() {
  checkoutModal.classList.remove("is-open");
  checkoutModal.setAttribute("aria-hidden", "true");
  if (!cartPanel.classList.contains("is-open") && !productModal.classList.contains("is-open")) {
    document.body.classList.remove("cart-open");
  }
}

async function submitOrder(event) {
  event.preventDefault();
  checkoutStatus.textContent = "Enviando pedido...";
  checkoutStatus.classList.remove("is-error", "is-success");

  const formData = new FormData(checkoutForm);
  const payload = {
    customer: Object.fromEntries(formData.entries()),
    deliveryMethod: formData.get("deliveryPreference") || "A combinar",
    items: cartPayload(),
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível enviar o pedido.");

    const whatsappUrl = getWhatsAppUrl(orderWhatsAppMessage(data.order));
    checkoutStatus.classList.add("is-success");
    checkoutStatus.innerHTML = `
      <strong>Pedido ${escapeHtml(data.order.id)} enviado.</strong>
      <span>A Pluckten vai confirmar prazo, estoque e disponibilidade.</span>
      <div class="checkout-next-actions">
        <a class="mini-button" href="${whatsappUrl}" target="_blank" rel="noreferrer">Chamar no WhatsApp</a>
        <a class="mini-button" href="#pedido" data-checkout-close data-cart-close>Consultar status depois</a>
      </div>
    `;
    cart.clear();
    renderCart();
    checkoutForm.reset();
  } catch (error) {
    checkoutStatus.textContent = error.message;
    checkoutStatus.classList.add("is-error");
  }
}

async function submitStatusSearch(event) {
  event.preventDefault();
  statusResult.classList.remove("is-error");
  statusResult.innerHTML = "Consultando pedido...";

  const formData = new FormData(statusForm);
  const params = new URLSearchParams({
    orderId: formData.get("orderId"),
    phone: formData.get("phone"),
  });

  try {
    const response = await fetch(`/api/orders/status?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível consultar o pedido.");

    const order = data.order;
    const deadline = order.deadline ? formatDate(order.deadline) : "A combinar";
    statusResult.innerHTML = `
      <article class="status-summary">
        <div>
          <span class="stock-badge">${escapeHtml(order.status)}</span>
          <strong>${escapeHtml(order.id)}</strong>
        </div>
        <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
        <p><strong>Entrega:</strong> ${escapeHtml(order.deliveryMethod || "A combinar")}</p>
        <p><strong>Pagamento:</strong> ${escapeHtml(order.paymentPreference || "A combinar")}</p>
        <p><strong>Prazo:</strong> ${escapeHtml(deadline)}</p>
        <ol>
          ${(order.items || [])
            .map((item) => `<li>${Number(item.quantity || 1)}x ${escapeHtml(item.name)} - ${formatPrice(item.subtotal)}</li>`)
            .join("")}
        </ol>
      </article>
    `;
  } catch (error) {
    statusResult.textContent = error.message;
    statusResult.classList.add("is-error");
  }
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-product]");
  const viewButton = event.target.closest("[data-view-product]");
  const increaseButton = event.target.closest("[data-increase]");
  const decreaseButton = event.target.closest("[data-decrease]");

  if (addButton) {
    addToCart(addButton.dataset.addProduct);
    if (!addButton.disabled) openCart();
  }

  if (viewButton) {
    openProductDetails(viewButton.dataset.viewProduct);
  }

  if (event.target.closest("[data-detail-add]")) {
    addToCart(selectedProductId);
    closeProductDetails();
    openCart();
  }

  if (increaseButton) {
    updateQuantity(increaseButton.dataset.increase, 1);
  }

  if (decreaseButton) {
    updateQuantity(decreaseButton.dataset.decrease, -1);
  }

  if (event.target.closest("[data-clear-filters]")) {
    productSearch.value = "";
    categoryFilter.value = "";
    renderProducts();
  }

  if (event.target.closest("[data-product-modal-close]")) {
    closeProductDetails();
  }

  if (event.target.closest("[data-cart-open]")) {
    openCart();
  }

  if (event.target.closest("[data-cart-close]")) {
    closeCart();
  }

  if (event.target.closest("[data-checkout-open]")) {
    openCheckout();
  }

  if (event.target.closest("[data-checkout-close]")) {
    closeCheckout();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeProductDetails();
    closeCheckout();
    closeCart();
  }
});

productSearch.addEventListener("input", renderProducts);
categoryFilter.addEventListener("change", renderProducts);
clearFiltersButton.addEventListener("click", renderProducts);
checkoutForm.addEventListener("submit", submitOrder);
statusForm.addEventListener("submit", submitStatusSearch);
setContactLinks();
loadProducts();
