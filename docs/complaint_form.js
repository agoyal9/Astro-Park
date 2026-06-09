const select = document.getElementById("complaint-reason");
const otherContainer = document.getElementById("other-container");
const otherInput = document.getElementById("other-reason");
const customerMeta = document.getElementById("customer-meta");
const firstNameInput = document.getElementById("fname");
const lastNameInput = document.getElementById("lname");
const emailInput = document.getElementById("email");
const submitButton = document.querySelector(".submit-btn");

function hydrateCustomerProfile() {
  const firstName = (
    sessionStorage.getItem("customer_first_name") || ""
  ).trim();
  const lastName = (sessionStorage.getItem("customer_last_name") || "").trim();
  const email = (
    sessionStorage.getItem("customer_email_address") ||
    sessionStorage.getItem("username") ||
    ""
  ).trim();

  firstNameInput.value = firstName;
  lastNameInput.value = lastName;
  emailInput.value = email;

  if (firstName && lastName && email) {
    customerMeta.textContent = `${firstName} ${lastName} (${email})`;
    submitButton.disabled = false;
    return;
  }

  customerMeta.textContent = "Profile not found. Please log in again.";
  submitButton.disabled = true;
}

async function loadRideOptions() {
  try {
    const response = await fetch("/rides");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const rides = await response.json();
    select.innerHTML = ""; // Clear placeholder

    // Add ride options with ride_id as value
    rides.forEach((ride) => {
      const option = document.createElement("option");
      option.value = String(ride.ride_id);
      option.textContent = ride.ride_name;
      select.appendChild(option);
    });

    // Add static category options
    ["giftshop", "employee", "other"].forEach((val) => {
      const option = document.createElement("option");
      option.value = val;
      option.textContent =
        val === "giftshop"
          ? "Gift Shop"
          : val.charAt(0).toUpperCase() + val.slice(1);
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading rides:", error);
    select.innerHTML = '<option value="" disabled>Error loading rides</option>';
  }
}

// Load rides on page load
hydrateCustomerProfile();
loadRideOptions();

select.addEventListener("change", function () {
  if (this.value === "other") {
    otherContainer.style.display = "block";
    otherInput.required = true;
  } else {
    otherContainer.style.display = "none";
    otherInput.required = false;
    otherInput.value = "";
  }
});
