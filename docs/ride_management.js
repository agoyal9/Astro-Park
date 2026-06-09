let allRides = [];

function statusLabel(status) {
  return Number(status) === 1 ? "Closed" : "Active";
}

async function addRide() {
  const ride_name = document.getElementById("add-name").value.trim();
  const ride_price = document.getElementById("add-price").value;
  const ride_status = parseInt(document.getElementById("add-status").value, 10);
  const msgEl = document.getElementById("addMsg");

  msgEl.className = "msg";
  msgEl.textContent = "";

  if (!ride_name || !ride_price) {
    msgEl.className = "msg error";
    msgEl.textContent = "Please fill in all required fields.";
    return;
  }

  if (Number(ride_price) <= 0) {
    msgEl.className = "msg error";
    msgEl.textContent = "Ride price must be greater than 0.";
    return;
  }

  try {
    const res = await fetch("/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        role_id: sessionStorage.getItem("role_id"),
      },
      body: JSON.stringify({
        ride_name,
        ride_price,
        ride_status,
      }),
    });

    if (res.ok) {
      msgEl.className = "msg success";
      msgEl.textContent = "Ride added successfully.";
      document.getElementById("add-name").value = "";
      document.getElementById("add-price").value = "";
      document.getElementById("add-status").value = "0";
      loadRides();
    } else {
      const err = await res.text();
      msgEl.className = "msg error";
      msgEl.textContent = "Error: " + err;
    }
  } catch (err) {
    msgEl.className = "msg error";
    msgEl.textContent = "Failed to connect to server.";
  }
}

async function loadRides() {
  document.getElementById("status").textContent = "Loading...";
  document.getElementById("ridesTable").innerHTML = "";
  const msgEl = document.getElementById("actionMsg");
  msgEl.className = "msg";
  msgEl.textContent = "";
  document.getElementById("searchInput").value = "";

  try {
    const response = await fetch("/rides/all", {
      headers: {
        role_id: sessionStorage.getItem("role_id"),
      },
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { message: text };
    }

    if (!response.ok) {
      document.getElementById("status").textContent = "";
      msgEl.className = "msg error";
      msgEl.textContent = `Error loading rides: ${data.message || "Request failed."}`;
      return;
    }

    allRides = data;
    document.getElementById("status").textContent = "";

    if (!data || data.length === 0) {
      document.getElementById("ridesTable").innerHTML =
        "<p style='color:#555;'>No rides found.</p>";
      return;
    }

    renderTable(data);
  } catch (err) {
    document.getElementById("status").textContent = "";
    msgEl.className = "msg error";
    msgEl.textContent = "Error loading rides: Server not reachable.";
  }
}

function searchRides() {
  const query = document
    .getElementById("searchInput")
    .value.trim()
    .toLowerCase();

  if (!query) {
    renderTable(allRides);
    return;
  }

  const filtered = allRides.filter((r) =>
    r.ride_name.toLowerCase().includes(query),
  );
  renderTable(filtered);
}

function renderTable(data) {
  if (!data || data.length === 0) {
    document.getElementById("ridesTable").innerHTML =
      "<p style='color:#555;'>No rides found.</p>";
    return;
  }

  let html = "<table><thead><tr>";
  html += "<th>ID</th>";
  html += "<th>Ride Name</th>";
  html += "<th>Ride Price</th>";
  html += "<th>Status</th>";
  html += "<th>Deprecated</th>";
  html += "<th>Actions</th>";
  html += "</tr></thead><tbody>";

  data.forEach((ride) => {
    const safeRideName = String(ride.ride_name)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
    html += `<tr id="rrow-${ride.ride_id}">`;
    html += `<td>${ride.ride_id}</td>`;
    html += `<td id="rname-${ride.ride_id}">${ride.ride_name}</td>`;
    html += `<td id="rprice-${ride.ride_id}">${Number(ride.ride_price).toFixed(2)}</td>`;
    html += `<td id="rstatus-${ride.ride_id}">${statusLabel(ride.ride_status)}</td>`;
    html += `<td id="rdeprecated-${ride.ride_id}">${Number(ride.deprecated) === 1 ? "Yes" : "No"}</td>`;
    html += `<td>
                    <button class="small secondary" onclick="editRide(${ride.ride_id}, '${safeRideName}', ${Number(ride.ride_price)}, ${Number(ride.ride_status)})">Edit</button>
										<button class="small ${Number(ride.deprecated) === 1 ? "restore" : "warning"}" onclick="setRideDeprecated(${ride.ride_id}, '${safeRideName}', ${Number(ride.deprecated) === 1 ? 0 : 1})">${Number(ride.deprecated) === 1 ? "Restore" : "Deprecate"}</button>
                  </td>`;
    html += "</tr>";
  });

  html += "</tbody></table>";
  document.getElementById("ridesTable").innerHTML = html;
}

function editRide(id, rideName, ridePrice, rideStatus) {
  document.getElementById(`rname-${id}`).innerHTML =
    `<input class="inline-edit" id="edit-name-${id}" value="${rideName}">`;

  document.getElementById(`rprice-${id}`).innerHTML =
    `<input class="inline-edit" type="number" id="edit-price-${id}" value="${ridePrice}" min="0.01" step="0.01">`;

  const statusOptions = `
					<option value="0" ${rideStatus === 0 ? "selected" : ""}>Active</option>
					<option value="1" ${rideStatus === 1 ? "selected" : ""}>Closed</option>
				`;

  document.getElementById(`rstatus-${id}`).innerHTML =
    `<select class="inline-edit" id="edit-status-${id}">${statusOptions}</select>`;

  const actionsTd = document.querySelector(`#rrow-${id} td:last-child`);
  actionsTd.innerHTML = `
					<button class="small success" onclick="saveRide(${id})">&#10003; Save</button>
					<button class="small secondary" onclick="loadRides()">&#10005; Cancel</button>
				`;
}

async function saveRide(id) {
  const ride_name = document.getElementById(`edit-name-${id}`).value.trim();
  const ride_price = document.getElementById(`edit-price-${id}`).value;
  const ride_status = parseInt(
    document.getElementById(`edit-status-${id}`).value,
    10,
  );
  const msgEl = document.getElementById("actionMsg");

  if (!ride_name || !ride_price) {
    msgEl.className = "msg error";
    msgEl.textContent = "Ride name and price are required.";
    return;
  }

  if (Number(ride_price) <= 0) {
    msgEl.className = "msg error";
    msgEl.textContent = "Ride price must be greater than 0.";
    return;
  }

  try {
    const res = await fetch(`/rides/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        role_id: sessionStorage.getItem("role_id"),
      },
      body: JSON.stringify({
        ride_name,
        ride_price,
        ride_status,
      }),
    });

    if (res.ok) {
      msgEl.className = "msg success";
      msgEl.textContent = "Ride updated successfully.";
      loadRides();
    } else {
      const err = await res.text();
      msgEl.className = "msg error";
      msgEl.textContent = "Error: " + err;
    }
  } catch (err) {
    msgEl.className = "msg error";
    msgEl.textContent = "Failed to connect to server.";
  }
}

async function setRideDeprecated(id, rideName, deprecated) {
  const msgEl = document.getElementById("actionMsg");
  msgEl.className = "msg";
  msgEl.textContent = "";

  const actionWord = deprecated === 1 ? "deprecate" : "restore";
  const confirmed = window.confirm(
    `Are you sure you want to ${actionWord} ${rideName}?`,
  );

  if (!confirmed) {
    return;
  }

  try {
    const res = await fetch(`/rides/${id}/deprecated`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        role_id: sessionStorage.getItem("role_id"),
      },
      body: JSON.stringify({ deprecated }),
    });

    let payload = { message: "Request failed." };
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      payload = await res.json();
    } else {
      const text = await res.text();
      payload = { message: text };
    }

    if (!res.ok) {
      msgEl.className = "msg error";
      msgEl.textContent = payload.message || "Failed to update deprecation.";
      return;
    }

    msgEl.className = "msg success";
    msgEl.textContent =
      payload.message ||
      (deprecated === 1
        ? "Ride marked as deprecated."
        : "Ride restored successfully.");
    loadRides();
  } catch (err) {
    msgEl.className = "msg error";
    msgEl.textContent = "Failed to connect to server.";
  }
}

loadRides();
