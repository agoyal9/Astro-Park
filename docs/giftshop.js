let inventory = [];
let lowStockAlerts = [];

const roleId = Number(sessionStorage.getItem("role_id"));
const username = sessionStorage.getItem("username");

const inventoryBody = document.getElementById("inventory-body");
const formMsg = document.getElementById("form-msg");
const tableMsg = document.getElementById("table-msg");
const addForm = document.getElementById("add-product-form");
const searchInput = document.getElementById("search-input");
const alertStack = document.getElementById("low-stock-alerts");

if (!username || ![1, 3].includes(roleId)) {
  sessionStorage.clear();
  window.location.href = "/login.html";
}

document.getElementById("refresh-btn").addEventListener("click", () => {
  loadInventory();
  loadLowStockAlerts();
});

document.getElementById("clear-btn").addEventListener("click", () => {
  addForm.reset();
  setMessage(formMsg, "", "");
});

searchInput.addEventListener("input", () => {
  renderInventory(searchInput.value.trim().toLowerCase());
});

setInterval(loadLowStockAlerts, 15000);

addForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const productName = document.getElementById("product-name").value.trim();
  const productPrice = Number(document.getElementById("product-price").value);
  const stock = Number(document.getElementById("product-stock").value);

  if (
    !productName ||
    !Number.isFinite(productPrice) ||
    !Number.isInteger(stock)
  ) {
    setMessage(formMsg, "Please provide valid product details.", "error");
    return;
  }

  if (productPrice <= 0) {
    setMessage(formMsg, "Price must be greater than 0.", "error");
    return;
  }

  if (stock < 0) {
    setMessage(formMsg, "Stock cannot be negative.", "error");
    return;
  }

  try {
    const response = await fetch("/gift-shop/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        role_id: String(roleId),
      },
      body: JSON.stringify({
        product_name: productName,
        product_price: productPrice,
        stock,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(formMsg, data.message || "Unable to add product.", "error");
      return;
    }

    setMessage(formMsg, "Product added successfully.", "success");
    addForm.reset();
    await loadInventory();
    await loadLowStockAlerts();
  } catch (err) {
    setMessage(formMsg, "Server error. Please try again.", "error");
  }
});

async function loadInventory() {
  setMessage(tableMsg, "Loading inventory...", "");

  try {
    const response = await fetch("/gift-shop/products", {
      headers: {
        role_id: String(roleId),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(
        tableMsg,
        data.message || "Unable to load inventory.",
        "error",
      );
      return;
    }

    inventory = data;
    setMessage(tableMsg, "", "");
    renderInventory(searchInput.value.trim().toLowerCase());
    await loadLowStockAlerts();
  } catch (err) {
    setMessage(tableMsg, "Server error while loading inventory.", "error");
  }
}

function renderInventory(searchTerm = "") {
  inventoryBody.innerHTML = "";

  const filtered = inventory.filter((item) => {
    if (!searchTerm) return true;
    return item.product_name.toLowerCase().includes(searchTerm);
  });

  if (filtered.length === 0) {
    inventoryBody.innerHTML = `
			<tr>
				<td colspan="6">No products found.</td>
			</tr>
		`;
    return;
  }

  filtered.forEach((item) => {
    const status = getStockStatus(item.stock);
    const row = document.createElement("tr");

    row.innerHTML = `
			<td>${item.product_id}</td>
			<td id="name-${item.product_id}">${escapeHtml(item.product_name)}</td>
			<td id="price-${item.product_id}">$${Number(item.product_price).toFixed(2)}</td>
			<td id="stock-${item.product_id}">${item.stock}</td>
			<td><span class="status-pill ${status.className}">${status.label}</span></td>
			<td id="actions-${item.product_id}" class="row-actions">
				<button class="btn small ghost" type="button" onclick="startEdit(${item.product_id})">Edit</button>
        <button class="btn small delete" type="button" onclick="deleteProduct(${item.product_id})">Delete</button>
			</td>
		`;

    inventoryBody.appendChild(row);
  });
}

function startEdit(productId) {
  const current = inventory.find((item) => item.product_id === productId);
  if (!current) return;

  document.getElementById(`name-${productId}`).innerHTML = `
		<input class="inline-input" id="edit-name-${productId}" value="${escapeHtml(
      current.product_name,
    )}" maxlength="100" />
	`;

  document.getElementById(`price-${productId}`).innerHTML = `
		<input class="inline-input" id="edit-price-${productId}" type="number" min="0.01" step="0.01" value="${Number(
      current.product_price,
    ).toFixed(2)}" />
	`;

  document.getElementById(`stock-${productId}`).innerHTML = `
		<input class="inline-input" id="edit-stock-${productId}" type="number" min="0" step="1" value="${current.stock}" />
	`;

  document.getElementById(`actions-${productId}`).innerHTML = `
		<button class="btn small" type="button" onclick="saveEdit(${productId})">Save</button>
		<button class="btn small ghost" type="button" onclick="renderInventory(searchInput.value.trim().toLowerCase())">Cancel</button>
	`;
}

async function saveEdit(productId) {
  const productName = document
    .getElementById(`edit-name-${productId}`)
    .value.trim();
  const productPrice = Number(
    document.getElementById(`edit-price-${productId}`).value,
  );
  const stock = Number(
    document.getElementById(`edit-stock-${productId}`).value,
  );

  if (
    !productName ||
    !Number.isFinite(productPrice) ||
    !Number.isInteger(stock)
  ) {
    setMessage(tableMsg, "Please provide valid values.", "error");
    return;
  }

  if (productPrice <= 0 || stock < 0) {
    setMessage(tableMsg, "Price must be > 0 and stock must be >= 0.", "error");
    return;
  }

  try {
    const response = await fetch(`/gift-shop/products/${productId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        role_id: String(roleId),
      },
      body: JSON.stringify({
        product_name: productName,
        product_price: productPrice,
        stock,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(
        tableMsg,
        data.message || "Unable to update product.",
        "error",
      );
      return;
    }

    setMessage(tableMsg, "Product updated.", "success");
    await loadInventory();
    await loadLowStockAlerts();
  } catch (err) {
    setMessage(tableMsg, "Server error while updating.", "error");
  }
}

async function deleteProduct(productId) {
  const confirmed = window.confirm("Delete this product from inventory?");
  if (!confirmed) return;

  try {
    const response = await fetch(`/gift-shop/products/${productId}`, {
      method: "DELETE",
      headers: {
        role_id: String(roleId),
      },
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(
        tableMsg,
        data.message || "Unable to delete product.",
        "error",
      );
      return;
    }

    setMessage(tableMsg, "Product deleted.", "success");
    await loadInventory();
    await loadLowStockAlerts();
  } catch (err) {
    setMessage(tableMsg, "Server error while deleting.", "error");
  }
}

async function loadLowStockAlerts() {
  if (!alertStack) return;

  try {
    const response = await fetch("/gift-shop/alerts", {
      headers: {
        role_id: String(roleId),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      renderLowStockAlerts([]);
      return;
    }

    lowStockAlerts = Array.isArray(data) ? data : [];
    renderLowStockAlerts(lowStockAlerts);
  } catch (err) {
    renderLowStockAlerts([]);
  }
}

function renderLowStockAlerts(alerts) {
  if (!alertStack) return;

  if (!alerts.length) {
    alertStack.innerHTML = "";
    alertStack.style.display = "none";
    return;
  }

  alertStack.style.display = "flex";
  alertStack.innerHTML = alerts
    .map(
      (alert) => `
        <article class="alert-card">
          <h3>Low Stock Alert</h3>
          <p><strong>${escapeHtml(alert.product_name)}</strong> is running low.</p>
          <p>Current stock: ${Number(alert.current_stock)} | Threshold: ${Number(alert.threshold)}</p>
          <p>${escapeHtml(alert.message)}</p>
          <div class="alert-actions">
            <button class="acknowledge" type="button" data-alert-id="${alert.alert_id}">Acknowledge</button>
          </div>
          <p class="alert-muted">Created ${new Date(alert.created_at).toLocaleString()}</p>
        </article>
      `,
    )
    .join("");

  alertStack.querySelectorAll("button[data-alert-id]").forEach((button) => {
    button.addEventListener("click", () =>
      acknowledgeAlert(button.dataset.alertId),
    );
  });
}

async function acknowledgeAlert(alertId) {
  try {
    const response = await fetch(`/gift-shop/alerts/${alertId}/acknowledge`, {
      method: "PUT",
      headers: {
        role_id: String(roleId),
      },
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(
        tableMsg,
        data.message || "Unable to acknowledge alert.",
        "error",
      );
      return;
    }

    await loadLowStockAlerts();
  } catch (err) {
    setMessage(tableMsg, "Server error while acknowledging alert.", "error");
  }
}

function getStockStatus(stock) {
  if (stock <= 0) return { label: "Out", className: "out" };
  if (stock < 10) return { label: "Low", className: "low" };
  return { label: "In Stock", className: "ok" };
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = "msg";
  if (type === "success") element.classList.add("success");
  if (type === "error") element.classList.add("error");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.startEdit = startEdit;
window.saveEdit = saveEdit;
window.deleteProduct = deleteProduct;

loadInventory();
