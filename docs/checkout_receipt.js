const receiptTime = document.getElementById("receipt-time");
const ticketItems = document.getElementById("ticket-items");
const giftItems = document.getElementById("gift-items");
const ticketSubtotal = document.getElementById("ticket-subtotal");
const giftSubtotal = document.getElementById("gift-subtotal");
const grandTotal = document.getElementById("grand-total");
const ticketSection = document.getElementById("ticket-section");
const giftSection = document.getElementById("gift-section");

function loadReceipt() {
  let receipt = null;
  try {
    receipt = JSON.parse(sessionStorage.getItem("last_receipt") || "null");
  } catch {
    receipt = null;
  }

  if (!receipt) {
    receiptTime.textContent = "No recent receipt found.";
    ticketSection.style.display = "none";
    giftSection.style.display = "none";
    grandTotal.textContent = "0.00";
    return;
  }

  const purchasedAt = receipt.purchasedAt
    ? new Date(receipt.purchasedAt)
    : new Date();
  receiptTime.textContent = `Receipt date: ${purchasedAt.toLocaleString()}`;

  renderTicketItems(receipt.ticketItems || []);
  renderGiftItems(receipt.giftItems || []);

  ticketSubtotal.textContent = Number(receipt.ticketSubtotal || 0).toFixed(2);
  giftSubtotal.textContent = Number(receipt.giftSubtotal || 0).toFixed(2);
  grandTotal.textContent = Number(receipt.grandTotal || 0).toFixed(2);
}

function renderTicketItems(items) {
  ticketItems.innerHTML = "";
  if (!items.length) {
    ticketSection.style.display = "none";
    return;
  }

  ticketSection.style.display = "block";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.ride_name} - ${item.ticket_type} x ${item.quantity} @ $${Number(item.unit_price).toFixed(2)} = $${Number(item.line_total).toFixed(2)}`;
    ticketItems.appendChild(li);
  });
}

function renderGiftItems(items) {
  giftItems.innerHTML = "";
  if (!items.length) {
    giftSection.style.display = "none";
    return;
  }

  giftSection.style.display = "block";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.product_name} x ${item.quantity} @ $${Number(item.unit_price).toFixed(2)} = $${Number(item.line_total).toFixed(2)}`;
    giftItems.appendChild(li);
  });
}

loadReceipt();
