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
const detailTrust = document.querySelector("[data-detail-trust]");
const variantPicker = document.querySelector("[data-variant-picker]");
const detailVariant = document.querySelector("[data-detail-variant]");
const detailVariantOptions = document.querySelector("[data-detail-variant-options]");
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
const checkoutSummary = document.querySelector("[data-checkout-summary]");
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

function getVariants(product) {
  return Array.isArray(product.variants) ? product.variants : [];
}

function findVariant(product, variantId) {
  return getVariants(product).find((variant) => variant.id === variantId) || null;
}

function productChoices(product) {
  const baseChoice = {
    id: "",
    name: "Kit padrão",
    detail: product.pack || product.sku || "Opção principal",
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    sku: product.sku || "",
    isBase: true,
  };

  return [
    baseChoice,
    ...getVariants(product).map((variant) => ({
      id: variant.id,
      name: variant.name,
      detail: variant.sku || "Variação",
      price: Number(variant.price || 0),
      stock: Number(variant.stock || 0),
      sku: variant.sku || "",
      isBase: false,
    })),
  ];
}

function findChoice(product, choiceId) {
  if (!choiceId) return productChoices(product)[0] || null;
  return productChoices(product).find((choice) => choice.id === choiceId) || null;
}

function productDisplayPrice(product) {
  const variants = getVariants(product);
  if (variants.length === 0) return Number(product.price || 0);
  return Math.min(...productChoices(product).map((choice) => Number(choice.price || 0)));
}

function productDisplayStock(product) {
  const variants = getVariants(product);
  if (variants.length === 0) return Number(product.stock || 0);
  return productChoices(product).reduce((sum, choice) => sum + Number(choice.stock || 0), 0);
}

function stockLabel(value) {
  const stock = Number(value || 0);
  return stock === 1 ? "1 unidade" : `${stock} unidades`;
}

function cartKey(id, variantId = "") {
  return `${id}::${variantId}`;
}

function parseCartKey(key) {
  const [id, variantId = ""] = String(key).split("::");
  return { id, variantId };
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
    "Olá, Pluckten Distribuidora Med! Acabei de enviar uma cotação pelo site.",
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

const statusSteps = ["novo", "confirmado", "separando", "enviado", "entregue"];

const statusText = {
  novo: "Pedido recebido",
  confirmado: "Confirmado",
  separando: "Em separação",
  enviado: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function renderStatusTimeline(status) {
  const normalized = String(status || "novo").toLowerCase();
  if (normalized === "cancelado") {
    return `
      <div class="status-timeline is-canceled">
        <span class="is-current">Pedido cancelado</span>
      </div>
    `;
  }

  const currentIndex = Math.max(0, statusSteps.indexOf(normalized));
  return `
    <div class="status-timeline">
      ${statusSteps
        .map((step, index) => {
          const state = index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : "";
          return `<span class="${state}">${escapeHtml(statusText[step])}</span>`;
        })
        .join("")}
    </div>
  `;
}

function setContactLinks() {
  whatsappLinks.forEach((link) => {
    link.href = getWhatsAppUrl("Olá, Pluckten Distribuidora Med! Quero saber mais sobre os produtos disponíveis.");
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
        <p>Confira se o servidor da Pluckten Distribuidora Med está rodando.</p>
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
      ...getVariants(product).flatMap((variant) => [variant.name, variant.sku]),
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
      const variants = getVariants(product);
      const disabled = availability === "unavailable" ? "disabled" : "";
      const stockText =
        availability === "on_request" ? "estoque sob consulta" : `estoque: ${productDisplayStock(product)}`;
      const priceLabel = variants.length ? `A partir de ${formatPrice(productDisplayPrice(product))}` : formatPrice(product.price);
      const availabilityText = availabilityLabels[availability];

      return `
        <article class="product-card" data-view-product="${escapeHtml(product.id)}">
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
              ${variants.length ? `<span class="stock-badge">${variants.length} opções</span>` : ""}
              ${product.brand ? `<span class="product-code">${escapeHtml(product.brand)}</span>` : ""}
              <span class="product-code">${escapeHtml(product.pack)}</span>
              <span class="product-code">${escapeHtml(stockText)}</span>
            </div>
            <div class="product-footer">
              <div class="price-stack">
                ${availabilityBadge(product)}
                <span class="price">${priceLabel}</span>
                <small>${escapeHtml(availabilityText)} com confirmação no atendimento</small>
              </div>
              <div class="product-actions">
                <button class="mini-button" type="button" data-view-product="${escapeHtml(product.id)}">
                  Detalhes
                </button>
                <button class="add-button" type="button" data-add-product="${escapeHtml(product.id)}" ${disabled}>
                  ${variants.length ? "Escolher" : availability === "on_request" ? "Consultar" : "Adicionar"}
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
  const selectedVariant = findVariant(product, detailVariant.value);
  const selectedChoice = findChoice(product, detailVariant.value);
  return [
    ["Marca", product.brand],
    ["SKU", selectedVariant?.sku || product.sku],
    ["Embalagem", product.pack],
    ["Regularização / ANVISA", product.anvisa],
    ["Lote", product.batch],
    ["Validade", formatDate(product.validity)],
    ["Disponibilidade", availabilityLabels[getAvailability(product)]],
    [
      "Estoque",
      getAvailability(product) === "on_request"
        ? "Sob consulta"
        : selectedVariant
          ? Number(selectedVariant.stock || 0)
          : Number(selectedChoice?.stock ?? product.stock ?? 0),
    ],
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function productNotes(product) {
  return [
    ["Modo de uso / indicação", product.usage],
    ["Observação de venda", product.salesNotes],
  ].filter(([, value]) => value);
}

function renderDetailGrid(product) {
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
}

function renderDetailTrust(product) {
  const availability = getAvailability(product);
  const trustItems = [
    ["Disponibilidade", availabilityLabels[availability]],
    ["Regularização", product.anvisa ? "ANVISA informada" : "Consultar no atendimento"],
    ["Compra assistida", "Confirmação antes do pagamento"],
  ];

  detailTrust.innerHTML = trustItems
    .map(
      ([label, value]) => `
        <span>
          <small>${escapeHtml(label)}</small>
          <strong>${escapeHtml(value)}</strong>
        </span>
      `,
    )
    .join("");
}

function renderVariantOptions(product) {
  const choices = productChoices(product);
  detailVariantOptions.innerHTML = choices
    .map((choice) => {
      const selected = choice.id === detailVariant.value;
      const stockText =
        getAvailability(product) === "on_request" ? "Estoque sob consulta" : `Estoque: ${stockLabel(choice.stock)}`;
      return `
        <button class="variant-option ${choice.isBase ? "is-base" : ""} ${
          selected ? "is-selected" : ""
        }" type="button" data-select-variant="${escapeHtml(choice.id)}" aria-pressed="${selected}">
          <span>
            <strong>${escapeHtml(choice.name)}</strong>
            <small>${escapeHtml([choice.detail, stockText].filter(Boolean).join(" - "))}</small>
          </span>
          <b>${formatPrice(choice.price)}</b>
        </button>
      `;
    })
    .join("");
}

function openProductDetails(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  const variants = getVariants(product);
  const choices = productChoices(product);

  selectedProductId = id;
  detailImage.src = product.image;
  detailImage.alt = product.name;
  detailCategory.textContent = product.category || "Produto";
  detailName.textContent = product.name;
  detailDescription.textContent = product.description || "";
  variantPicker.hidden = variants.length === 0;
  detailVariant.innerHTML =
    variants.length > 0
      ? choices
          .map(
            (choice) => `
        <option value="${escapeHtml(choice.id)}">
          ${escapeHtml(choice.name)} - ${formatPrice(choice.price)}
        </option>
      `,
          )
          .join("")
      : "";
  detailVariant.value = "";
  detailPrice.textContent = formatPrice(product.price);
  renderDetailTrust(product);
  renderVariantOptions(product);
  renderDetailGrid(product);
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
  detailAdd.textContent = variants.length ? "Adicionar seleção" : getAvailability(product) === "on_request" ? "Consultar" : "Adicionar";

  productModal.classList.add("is-open");
  productModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
}

function updateDetailVariant() {
  const product = products.find((item) => item.id === selectedProductId);
  if (!product) return;
  const choice = findChoice(product, detailVariant.value);
  detailPrice.textContent = formatPrice(choice?.price ?? product.price);
  detailAdd.textContent = getVariants(product).length && !detailVariant.value ? "Adicionar kit" : "Adicionar seleção";
  renderVariantOptions(product);
  renderDetailGrid(product);
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
    (summary, [key, quantity]) => {
      const { id, variantId } = parseCartKey(key);
      const product = products.find((item) => item.id === id);
      if (!product) return summary;
      const variant = findVariant(product, variantId);
      const price = variant ? variant.price : product.price;

      summary.count += quantity;
      summary.total += price * quantity;
      return summary;
    },
    { count: 0, total: 0 },
  );
}

function cartPayload() {
  return [...cart.entries()].map(([key, quantity]) => {
    const { id, variantId } = parseCartKey(key);
    return { id, variantId, quantity };
  });
}

function cartItemLabel(product, variant) {
  if (variant) return `${product.name} - ${variant.name}`;
  return getVariants(product).length ? `${product.name} - Kit padrão` : product.name;
}

function cartLineItems() {
  return [...cart.entries()]
    .map(([key, quantity]) => {
      const { id, variantId } = parseCartKey(key);
      const product = products.find((item) => item.id === id);
      if (!product) return null;
      const variant = findVariant(product, variantId);
      const price = variant ? variant.price : product.price;
      const label = cartItemLabel(product, variant);
      return {
        key,
        product,
        variant,
        label,
        price,
        quantity,
        subtotal: price * quantity,
      };
    })
    .filter(Boolean);
}

function renderCheckoutSummary() {
  if (!checkoutSummary) return;
  const lines = cartLineItems();
  const summary = getCartSummary();

  if (lines.length === 0) {
    checkoutSummary.innerHTML = "";
    return;
  }

  checkoutSummary.innerHTML = `
    <div class="checkout-summary-head">
      <span>Resumo da cotação</span>
      <strong>${summary.count} ${summary.count === 1 ? "item" : "itens"}</strong>
    </div>
    <div class="checkout-summary-list">
      ${lines
        .map(
          (line) => `
            <article>
              <div>
                <strong>${escapeHtml(line.label)}</strong>
                <small>${line.quantity} x ${formatPrice(line.price)}</small>
              </div>
              <b>${formatPrice(line.subtotal)}</b>
            </article>
          `,
        )
        .join("")}
    </div>
    <div class="checkout-summary-total">
      <span>Total estimado</span>
      <strong>${formatPrice(summary.total)}</strong>
    </div>
    <p>Estoque, prazo, marca, frete e pagamento serão confirmados pela Pluckten antes de fechar.</p>
  `;
}

function renderCart() {
  const rows = [...cart.entries()]
    .map(([key, quantity]) => {
      const { id, variantId } = parseCartKey(key);
      const product = products.find((item) => item.id === id);
      if (!product) return "";
      const variant = findVariant(product, variantId);
      const price = variant ? variant.price : product.price;
      const label = cartItemLabel(product, variant);

      return `
        <article class="cart-row">
          <div>
            <h3>${escapeHtml(label)}</h3>
            <p>${formatPrice(price)} cada - subtotal ${formatPrice(price * quantity)}</p>
          </div>
          <div class="qty-control" aria-label="Quantidade de ${escapeHtml(label)}">
            <button type="button" data-decrease="${escapeHtml(key)}" aria-label="Diminuir">−</button>
            <span>${quantity}</span>
            <button type="button" data-increase="${escapeHtml(key)}" aria-label="Aumentar">+</button>
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
  renderCheckoutSummary();
}

function addToCart(id, variantId = "") {
  const product = products.find((item) => item.id === id);
  if (!product || getAvailability(product) === "unavailable") return;
  const variants = getVariants(product);
  if (variants.length > 0 && variantId && !findVariant(product, variantId)) {
    openProductDetails(id);
    return false;
  }
  const key = cartKey(id, variantId);
  cart.set(key, (cart.get(key) || 0) + 1);
  renderCart();
  return true;
}

function updateQuantity(key, delta) {
  const nextQuantity = (cart.get(key) || 0) + delta;

  if (nextQuantity <= 0) {
    cart.delete(key);
  } else {
    cart.set(key, nextQuantity);
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
  renderCheckoutSummary();
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
    const statusLabel = statusText[String(order.status || "novo").toLowerCase()] || order.status;
    statusResult.innerHTML = `
      <article class="status-summary">
        <div class="status-summary-head">
          <div>
            <span class="stock-badge">${escapeHtml(statusLabel)}</span>
            <strong>${escapeHtml(order.id)}</strong>
          </div>
          <small>Atualizado em ${new Date(order.updatedAt || order.createdAt).toLocaleDateString("pt-BR")}</small>
        </div>
        ${renderStatusTimeline(order.status)}
        <div class="status-meta-grid">
          <p><strong>Total:</strong> ${formatPrice(order.total)}</p>
          <p><strong>Entrega:</strong> ${escapeHtml(order.deliveryMethod || "A combinar")}</p>
          <p><strong>Pagamento:</strong> ${escapeHtml(order.paymentPreference || "A combinar")}</p>
          <p><strong>Prazo:</strong> ${escapeHtml(deadline)}</p>
        </div>
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
  const variantButton = event.target.closest("[data-select-variant]");

  if (addButton) {
    const product = products.find((item) => item.id === addButton.dataset.addProduct);
    if (getVariants(product || {}).length) {
      openProductDetails(addButton.dataset.addProduct);
      return;
    }
    const added = addToCart(addButton.dataset.addProduct);
    if (added && !addButton.disabled) openCart();
    return;
  }

  if (viewButton) {
    openProductDetails(viewButton.dataset.viewProduct);
    return;
  }

  if (variantButton) {
    detailVariant.value = variantButton.dataset.selectVariant;
    updateDetailVariant();
    return;
  }

  if (event.target.closest("[data-detail-add]")) {
    const product = products.find((item) => item.id === selectedProductId);
    const variantId = getVariants(product || {}).length ? detailVariant.value : "";
    const added = addToCart(selectedProductId, variantId);
    if (!added) return;
    closeProductDetails();
    openCart();
    return;
  }

  if (increaseButton) {
    updateQuantity(increaseButton.dataset.increase, 1);
    return;
  }

  if (decreaseButton) {
    updateQuantity(decreaseButton.dataset.decrease, -1);
    return;
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
detailVariant.addEventListener("change", updateDetailVariant);
setContactLinks();
loadProducts();
