const TICKET_CART_KEY = "ticket_cart";
const GIFT_CART_KEY = "gift_cart";

let ticketCart = loadCart(TICKET_CART_KEY);
let giftCart = loadCart(GIFT_CART_KEY);

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

function addToCart() {
  const rideId = Number.parseInt(
    document.getElementById("rideSelect").value,
    10,
  );
  const ticketType = document.getElementById("ticketType").value;
  const quantity = Number.parseInt(
    document.getElementById("ticketQuantity").value,
    10,
  );

  if (!Number.isInteger(rideId) || rideId <= 0) {
    alert("Please select a ride.");
    return;
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    alert("Quantity must be at least 1.");
    return;
  }

  const rideSelect = document.getElementById("rideSelect");
  const option = rideSelect.selectedOptions[0];
  const rideName = option.textContent;
  const ridePrice = Number.parseFloat(option.dataset.price);

  const existing = ticketCart.find(
    (item) => item.ride_id === rideId && item.ticket_type === ticketType,
  );

  if (existing) {
    existing.quantity += quantity;
  } else {
    ticketCart.push({
      ride_id: rideId,
      ticket_type: ticketType,
      quantity,
      ride_price: ridePrice,
      ride_name: rideName,
    });
  }

  renderCart();
}

function removeTicketItem(index) {
  ticketCart.splice(index, 1);
  renderCart();
}

function removeGiftItem(index) {
  giftCart.splice(index, 1);
  renderCart();
}

function renderCart() {
  const cartList = document.getElementById("cartList");
  cartList.innerHTML = "";

  ticketCart.forEach((item, index) => {
    const li = document.createElement("li");

    let price = item.ride_price;
    if (item.ticket_type === "Child") {
      price *= 0.5;
    }

    li.textContent = `[Ticket] ${item.ride_name} ($${price.toFixed(2)}) - ${item.ticket_type} x ${item.quantity} `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => removeTicketItem(index);

    li.appendChild(removeButton);
    cartList.appendChild(li);
  });

  giftCart.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = `[Gift] ${item.product_name} ($${Number(item.product_price).toFixed(2)}) x ${item.quantity} `;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => removeGiftItem(index);

    li.appendChild(removeButton);
    cartList.appendChild(li);
  });

  calculateTotal();
  saveCart(TICKET_CART_KEY, ticketCart);
  saveCart(GIFT_CART_KEY, giftCart);
}

function calculateTotal() {
  let total = 0;
  ticketCart.forEach((item) => {
    let price = item.ride_price;

    if (item.ticket_type === "Child") {
      price *= 0.5;
    }

    total += price * item.quantity;
  });

  giftCart.forEach((item) => {
    total += Number(item.product_price) * Number(item.quantity);
  });

  document.getElementById("totalPrice").textContent = total.toFixed(2);
}

async function loadRides() {
  try {
    const response = await fetch("/rides");
    const rides = await response.json();

    const rideSelect = document.getElementById("rideSelect");
    rideSelect.innerHTML = "";

    rides.forEach((ride) => {
      const option = document.createElement("option");
      option.value = ride.ride_id;
      option.textContent = `${ride.ride_name}`;
      option.dataset.price = ride.ride_price;
      option.dataset.name = ride.ride_name;
      rideSelect.appendChild(option);
    });
  } catch (err) {
    console.error("Error loading rides:", err);
  }
}

async function checkout() {
  const customerId = sessionStorage.getItem("customer_id");
  ticketCart = loadCart(TICKET_CART_KEY);
  giftCart = loadCart(GIFT_CART_KEY);

  if (!customerId) {
    alert("Must be logged in.");
    return;
  }

  if (ticketCart.length === 0 && giftCart.length === 0) {
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

    sessionStorage.removeItem(TICKET_CART_KEY);
    sessionStorage.removeItem(GIFT_CART_KEY);
    sessionStorage.setItem("last_receipt", JSON.stringify(result.receipt));

    ticketCart = [];
    giftCart = [];
    renderCart();
    window.location.href = "checkout_receipt.html";
  } catch (err) {
    alert("Checkout request failed. Please try again.");
  }
}

window.onload = async function onLoad() {
  await loadRides();
  renderCart();
};
