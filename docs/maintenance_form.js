document
  .getElementById("maintenance_form")
  .addEventListener("submit", function () {
    document.getElementById("employee_id").value =
      sessionStorage.getItem("employee_id");
  });

async function loadRideOptions() {
  const rideSelect = document.getElementById("which-ride");

  try {
    const response = await fetch("/rides");
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error("Server returned a non-JSON response.");
    }

    const rides = await response.json();

    if (!response.ok) {
      throw new Error("Failed to load rides.");
    }

    rideSelect.innerHTML = "";

    if (!rides || rides.length === 0) {
      rideSelect.innerHTML =
        '<option value="" disabled selected>No rides found</option>';
      return;
    }

    rides.forEach((ride) => {
      const option = document.createElement("option");
      option.value = String(ride.ride_id);
      option.textContent = ride.ride_name;
      rideSelect.appendChild(option);
    });
  } catch (err) {
    rideSelect.innerHTML =
      '<option value="" disabled selected>Error loading rides</option>';
  }
}

loadRideOptions();
