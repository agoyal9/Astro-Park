const GIFT_CART_KEY = "gift_cart";
const TICKET_CART_KEY = "ticket_cart";

let products = [];
let giftCart = loadCart(GIFT_CART_KEY);
let ticketCart = loadCart(TICKET_CART_KEY);

const grid = document.getElementById("product-grid");
const statusMsg = document.getElementById("status-msg");
const cartList = document.getElementById("cart-list");
const cartTotal = document.getElementById("cart-total");

document.getElementById("refresh-btn").addEventListener("click", loadProducts);
document.getElementById("clear-cart-btn").addEventListener("click", () => {
  giftCart = [];
  ticketCart = [];
  renderCart();
});

document.getElementById("checkout-btn").addEventListener("click", checkout);

function loadCart(key) {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCart(key, value) {
  sessionStorage.setItem(key, JSON.stringify(value));
}

function setStatus(message, isError = false) {
  statusMsg.textContent = message;
  statusMsg.style.color = isError ? "#a53025" : "#1e7d46";
}

async function loadProducts() {
  setStatus("Loading products...");
  try {
    const response = await fetch("/gift-shop/catalog");
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || "Failed to load products.", true);
      return;
    }

    products = data;
    renderProducts();
    setStatus(data.length ? "Products loaded." : "No products in stock.");
  } catch (err) {
    setStatus("Server error while loading products.", true);
  }
}

function renderProducts() {
  grid.innerHTML = "";

  if (!products.length) {
    grid.innerHTML = "<p>No products available right now.</p>";
    return;
  }

  products.forEach((product) => {
    const item = document.createElement("article");
    item.className = "product-item";
    item.innerHTML = `
      <h3>${escapeHtml(product.product_name)}</h3>
      <p class="product-meta">Price: $${Number(product.product_price).toFixed(2)}</p>
      <div class="quantity-row">
        <label for="qty-${product.product_id}">Qty</label>
        <input id="qty-${product.product_id}" type="number" min="1" max="${product.stock}" value="1" />
        <button type="button" data-id="${product.product_id}">Add</button>
      </div>
    `;

    const button = item.querySelector("button");
    button.addEventListener("click", () => addToCart(product.product_id));
    grid.appendChild(item);
  });
}

function addToCart(productId) {
  const product = products.find((p) => p.product_id === productId);
  if (!product) return;

  const qtyInput = document.getElementById(`qty-${productId}`);
  const quantity = Number(qtyInput.value);

  if (!Number.isInteger(quantity) || quantity < 1) {
    alert("Quantity must be at least 1.");
    return;
  }

  if (quantity > product.stock) {
    alert("Quantity exceeds available stock.");
    return;
  }

  const existing = giftCart.find((c) => c.product_id === productId);
  if (existing) {
    const newQty = existing.quantity + quantity;
    if (newQty > product.stock) {
      alert("Total quantity in cart exceeds stock.");
      return;
    }
    existing.quantity = newQty;
  } else {
    giftCart.push({
      product_id: product.product_id,
      product_name: product.product_name,
      product_price: Number(product.product_price),
      quantity,
    });
  }

  renderCart();
}

function renderCart() {
  cartList.innerHTML = "";
  let total = 0;

  giftCart.forEach((item, index) => {
    total += item.product_price * item.quantity;

    const li = document.createElement("li");
    li.textContent = `[Gift] ${item.product_name} - $${item.product_price.toFixed(2)} x ${item.quantity} `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      giftCart.splice(index, 1);
      renderCart();
    });

    li.appendChild(removeButton);
    cartList.appendChild(li);
  });

  ticketCart.forEach((item, index) => {
    let unitPrice = Number(item.ride_price);
    if (String(item.ticket_type).toLowerCase() === "child") {
      unitPrice *= 0.5;
    }
    total += unitPrice * Number(item.quantity);

    const li = document.createElement("li");
    li.textContent = `[Ticket] ${item.ride_name} - ${item.ticket_type} x ${item.quantity} ($${unitPrice.toFixed(2)} each) `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      ticketCart.splice(index, 1);
      renderCart();
    });

    li.appendChild(removeButton);
    cartList.appendChild(li);
  });

  cartTotal.textContent = total.toFixed(2);
  saveCart(GIFT_CART_KEY, giftCart);
  saveCart(TICKET_CART_KEY, ticketCart);
}

async function checkout() {
  const customerId = sessionStorage.getItem("customer_id");
  ticketCart = loadCart(TICKET_CART_KEY);
  giftCart = loadCart(GIFT_CART_KEY);

  if (!customerId) {
    alert("Must be logged in.");
    return;
  }

  if (giftCart.length === 0 && ticketCart.length === 0) {
    alert("Both carts are empty.");
    return;
  }

  try {
    const response = await fetch("/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer_id: customerId,
        ticket_cart: ticketCart,
        gift_cart: giftCart,
      }),
    });

    let result = null;
    try {
      result = await response.json();
    } catch {
      const text = await response.text();
      result = { message: text || "Checkout failed." };
    }

    if (!response.ok) {
      alert(result.message || "Checkout failed.");
      return;
    }

    sessionStorage.removeItem(GIFT_CART_KEY);
    sessionStorage.removeItem(TICKET_CART_KEY);
    sessionStorage.setItem("last_receipt", JSON.stringify(result.receipt));

    giftCart = [];
    ticketCart = [];
    renderCart();
    await loadProducts();
    window.location.href = "checkout_receipt.html";
  } catch (err) {
    alert("Checkout request failed. Please try again.");
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

renderCart();
loadProducts();
