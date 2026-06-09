document.addEventListener("DOMContentLoaded", async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get("ticket_id");

  if (!ticketId) {
    alert("No ticket ID provided");
    window.location.href = "/maintenances.html";
    return;
  }

  try {
    const response = await fetch(`/maintenance-tickets/${ticketId}`);
    if (!response.ok) {
      throw new Error("Ticket not found");
    }
    const ticket = await response.json();

    document.getElementById("ticket_id").value = ticket.ticket_id;
    document.getElementById("which-ride").value = ticket.ride_id;
    document.getElementById("maintenance-type").value = ticket.issue_type;
    document.getElementById("priority").value = ticket.maintenance_priority;
    document.getElementById("status").value = ticket.maintenance_status;
    document.getElementById("description").value =
      ticket.maintenance_description;

    const date = new Date(ticket.date_opened);
    const formattedDate = date.toISOString().slice(0, 16);
    document.getElementById("date-opened").value = formattedDate;
  } catch (error) {
    console.error("Error loading ticket:", error);
    alert("Error loading ticket data");
    window.location.href = "/maintenances.html";
  }
});

document
  .getElementById("edit_maintenance_form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const ticketId = document.getElementById("ticket_id").value;
    const formData = {
      issue_type: document.getElementById("maintenance-type").value,
      maintenance_description: document.getElementById("description").value,
      maintenance_priority: document.getElementById("priority").value,
      maintenance_status: document.getElementById("status").value,
    };

    try {
      const response = await fetch(`/update-maintenance/${ticketId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        window.location.href = "/maintenances.html";
      } else {
        const error = await response.text();
        console.error("Error updating ticket:", error);
      }
    } catch (error) {
      console.error("Error updating ticket:", error);
      alert("Error updating ticket");
    }
  });
