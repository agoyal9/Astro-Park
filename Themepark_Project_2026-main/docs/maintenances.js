let allTickets = [];

const priorityOrder = {
  high: 3,
  medium: 2,
  low: 1,
};

async function loadTickets() {
  const response = await fetch("/maintenance-tickets");
  const tickets = await response.json();

  allTickets = Array.isArray(tickets) ? tickets : [];
  renderTickets();
}

function getSortedTickets(sortMode) {
  const copy = [...allTickets];

  if (sortMode === "priority") {
    copy.sort((a, b) => {
      const aRank =
        priorityOrder[String(a.maintenance_priority || "").toLowerCase()] || 0;
      const bRank =
        priorityOrder[String(b.maintenance_priority || "").toLowerCase()] || 0;
      return bRank - aRank;
    });
    return copy;
  }

  if (sortMode === "status") {
    copy.sort((a, b) =>
      String(a.maintenance_status || "").localeCompare(
        String(b.maintenance_status || ""),
      ),
    );
    return copy;
  }

  if (sortMode === "type") {
    copy.sort((a, b) =>
      String(a.issue_type || "").localeCompare(String(b.issue_type || "")),
    );
    return copy;
  }

  copy.sort(
    (a, b) =>
      new Date(b.date_opened).getTime() - new Date(a.date_opened).getTime(),
  );
  return copy;
}

function renderTickets() {
  const sortSelect = document.getElementById("sortSelect");
  const showResolved = document.getElementById("showResolved");
  const sortMode = sortSelect ? sortSelect.value : "recent";
  let tickets = getSortedTickets(sortMode);

  if (!showResolved?.checked) {
    tickets = tickets.filter(
      (ticket) =>
        String(ticket.maintenance_status || "").toLowerCase() !== "resolved",
    );
  }

  const tbody = document.querySelector("#maintenanceTicketsTable tbody");
  tbody.innerHTML = "";

  if (tickets.length === 0) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="9" style="text-align:center; color:#4b5563;">No tickets to display.</td>';
    tbody.appendChild(row);
    return;
  }

  tickets.forEach((ticket) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${ticket.ticket_id}</td>
      <td>${ticket.ride_name || `Ride #${ticket.ride_id}`}</td>
      <td>${ticket.employee_id}</td>
      <td>${ticket.issue_type}</td>
      <td>${ticket.maintenance_priority}</td>
      <td>${ticket.maintenance_status}</td>
      <td>${ticket.maintenance_description}</td>
      <td>${ticket.date_opened}</td>
      <td>
        <button onclick="editTicket(${ticket.ticket_id})">Edit</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function editTicket(ticketId) {
  window.location.href = `/edit_maintenance.html?ticket_id=${ticketId}`;
}

document.getElementById("sortSelect").addEventListener("change", renderTickets);
document
  .getElementById("showResolved")
  .addEventListener("change", renderTickets);

loadTickets();
