const WHATSAPP_NUMBER = "5599999999999";

let products = [];
const cart = new Map();
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const productGrid = document.querySelector("[data-product-grid]");
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

function formatPrice(value) {
  return currency.format(value);
}

function getWhatsAppUrl(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
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

function renderProducts() {
  if (products.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-state">
        <strong>Catálogo em atualização.</strong>
        <p>Novos produtos aparecerão aqui assim que forem cadastrados.</p>
      </div>
    `;
    return;
  }

  productGrid.innerHTML = products
    .map(
      (product, index) => `
        <article class="product-card">
          <div class="product-image-shell">
            <img class="product-image" src="${product.image}" alt="${product.name}">
          </div>
          <div class="product-body">
            <div class="product-meta">
              <span class="tag">${product.category}</span>
              <span class="product-code">PLK-${String(index + 1).padStart(2, "0")}</span>
            </div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <span class="product-code">${product.pack} • estoque: ${product.stock ?? 0}</span>
            <div class="product-footer">
              <span class="price">${formatPrice(product.price)}</span>
              <button class="add-button" type="button" data-add-product="${product.id}">
                Adicionar
              </button>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
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
            <h3>${product.name}</h3>
            <p>${formatPrice(product.price)} cada</p>
          </div>
          <div class="qty-control" aria-label="Quantidade de ${product.name}">
            <button type="button" data-decrease="${id}" aria-label="Diminuir">−</button>
            <span>${quantity}</span>
            <button type="button" data-increase="${id}" aria-label="Aumentar">+</button>
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
  document.body.classList.remove("cart-open");
}

function openCheckout() {
  if (cart.size === 0) return;
  checkoutStatus.textContent = "";
  checkoutStatus.classList.remove("is-error");
  checkoutModal.classList.add("is-open");
  checkoutModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("cart-open");
}

function closeCheckout() {
  checkoutModal.classList.remove("is-open");
  checkoutModal.setAttribute("aria-hidden", "true");
  if (!cartPanel.classList.contains("is-open")) {
    document.body.classList.remove("cart-open");
  }
}

async function submitOrder(event) {
  event.preventDefault();
  checkoutStatus.textContent = "Enviando pedido...";
  checkoutStatus.classList.remove("is-error");

  const formData = new FormData(checkoutForm);
  const payload = {
    customer: Object.fromEntries(formData.entries()),
    deliveryMethod: "A combinar",
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

    checkoutStatus.textContent = `Pedido ${data.order.id} enviado. A Pluckten vai confirmar prazo e disponibilidade.`;
    cart.clear();
    renderCart();
    checkoutForm.reset();

    setTimeout(() => {
      closeCheckout();
      closeCart();
    }, 1800);
  } catch (error) {
    checkoutStatus.textContent = error.message;
    checkoutStatus.classList.add("is-error");
  }
}

document.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-product]");
  const increaseButton = event.target.closest("[data-increase]");
  const decreaseButton = event.target.closest("[data-decrease]");

  if (addButton) {
    addToCart(addButton.dataset.addProduct);
    openCart();
  }

  if (increaseButton) {
    updateQuantity(increaseButton.dataset.increase, 1);
  }

  if (decreaseButton) {
    updateQuantity(decreaseButton.dataset.decrease, -1);
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
    closeCheckout();
    closeCart();
  }
});

checkoutForm.addEventListener("submit", submitOrder);
setContactLinks();
loadProducts();
