document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = ""; 

    const sections = document.querySelectorAll(".page-section");
    const navLinks = document.querySelectorAll(".nav-links a");
    const editBikeModal = new bootstrap.Modal(document.getElementById("editBikeModal"));
    const confirmationModal = new bootstrap.Modal(document.getElementById("confirmationModal"));
    const sidebarToggle = document.getElementById("sidebarToggle");
    const newBookingToastEl = document.getElementById('newBookingToast');
    const newBookingToast = new bootstrap.Toast(newBookingToastEl);
    let categoriesCache = [];
    let actionToConfirm = null;
    let lastKnownMaxIds = { testdrive: 0, service: 0, bike: 0 };

    // --- Sidebar Toggle for Mobile ---
    if (sidebarToggle) {
        sidebarToggle.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-open");
        });
    }

    // --- Navigation ---
    const showSection = (hash) => {
        const targetId = hash ? hash.substring(1) : "dashboardSection";
        sections.forEach(sec => sec.classList.toggle("active", sec.id === targetId));
        navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${targetId}`));
    };

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const targetHash = e.currentTarget.getAttribute("href");
            history.pushState(null, null, targetHash);
            showSection(targetHash);
            if (window.innerWidth <= 992) {
                document.body.classList.remove("sidebar-open");
            }
        });
    });
    
    window.addEventListener("popstate", () => showSection(window.location.hash));

    // --- Fetch Utility ---
    const fetchData = async (endpoint) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/${endpoint}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch ${endpoint}:`, error);
            return [];
        }
    };

    // --- Dashboard ---
    const loadDashboard = async () => {
        const data = await fetchData("dashboard");
        document.getElementById("totalUsers").innerText = data.users || 0;
        document.getElementById("totalBikes").innerText = data.bikes || 0;
        document.getElementById("totalTestDrives").innerText = data.testDrives || 0;
        document.getElementById("totalServiceBookings").innerText = data.serviceBookings || 0;
        document.getElementById("totalBikeBookings").innerText = data.bikeBookings || 0;
        document.getElementById("totalContacts").innerText = data.contacts || 0;

        const stats = await fetchData("booking-stats");
        document.getElementById("totalPending").innerText = stats.pending || 0;
        document.getElementById("totalConfirmed").innerText = stats.confirmed || 0;
        document.getElementById("totalCompleted").innerText = stats.completed || 0;
        document.getElementById("totalCancelled").innerText = stats.cancelled || 0;

        const recentTestDrives = await fetchData("recent-testdrives");
        const tbody = document.getElementById("recentTestDrivesTableBody");
        if (tbody) {
            tbody.innerHTML = recentTestDrives.map(b => `
                <tr>
                    <td>${b.booking_id}</td>
                    <td>${b.full_name}</td>
                    <td>${b.bike_model}</td>
                    <td>${new Date(b.preferred_date).toLocaleDateString()}</td>
                    <td><span class="badge bg-${getStatusColor(b.status)}">${b.status.charAt(0).toUpperCase() + b.status.slice(1)}</span></td>
                </tr>
            `).join("");
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return 'warning text-dark';
            case 'confirmed': return 'primary';
            case 'completed': return 'success';
            case 'cancelled': return 'danger';
            default: return 'secondary';
        }
    };
    
    // --- Polling function for new bookings ---
    const checkForNewBookings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/check-new-bookings`);
            if (!response.ok) return;
            const latestIds = await response.json();

            let newBookingFound = false;
            let message = "You have a new booking!";

            if (latestIds.latestTestDriveId > lastKnownMaxIds.testdrive) {
                lastKnownMaxIds.testdrive = latestIds.latestTestDriveId;
                newBookingFound = true;
                message = "New Test Drive request received!";
                if(document.getElementById('testdriveSection').classList.contains('active')) loadTestDrives();
            }
            if (latestIds.latestServiceId > lastKnownMaxIds.service) {
                lastKnownMaxIds.service = latestIds.latestServiceId;
                newBookingFound = true;
                message = "New Service Booking received!";
                 if(document.getElementById('serviceBookingsSection').classList.contains('active')) loadServiceBookings();
            }
            if (latestIds.latestBikeId > lastKnownMaxIds.bike) {
                lastKnownMaxIds.bike = latestIds.latestBikeId;
                newBookingFound = true;
                message = "New Bike Booking received!";
                if(document.getElementById('bookingsSection').classList.contains('active')) loadBikeBookings();
            }

            if (newBookingFound) {
                document.getElementById('newBookingToastBody').innerText = message;
                newBookingToast.show();
                loadDashboard(); // Always refresh dashboard stats
            }
        } catch (error) {
            console.error("Polling error:", error);
        }
    };

    // --- Users ---
    const loadUsers = async () => {
        const users = await fetchData("users");
        document.getElementById("usersTableBody").innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.first_name} ${u.last_name}</td>
                <td>${u.email}</td>
                <td>${u.phone}</td>
                <td>${u.gender}</td>
                <td>${u.role}</td>
                <td>${new Date(u.created_at).toLocaleString()}</td>
                <td><button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}">Delete</button></td>
            </tr>`).join("");
    };

    // --- Categories ---
    const loadCategories = async () => {
        categoriesCache = await fetchData("categories");
        const selects = document.querySelectorAll("#bikeCategoryAdd, [name='category_id']");
        selects.forEach(select => {
            select.innerHTML = '<option value="">Select Category</option>' + categoriesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
        });
    };

    // --- Bikes ---
    const loadBikes = async () => {
        const bikes = await fetchData("bikes");
        document.getElementById("bikesTableBody").innerHTML = bikes.map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${b.category_name || "N/A"}</td>
                <td>${b.name}</td>
                <td>${b.price || ""}</td>
                <td>${b.engine || ""}</td>
                <td>${b.mileage || ""}</td>
                <td>${b.thumbnail ? `<img src="/images/${b.thumbnail}" alt="${b.name}" width="80"/>` : "No Image"}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-action="edit-bike" data-bike='${JSON.stringify(b)}'>Edit</button>
                    <button class="btn btn-sm btn-danger" data-action="delete-bike" data-id="${b.id}">Delete</button>
                </td>
            </tr>`).join("");
    };

    // --- Booking Tables Logic ---
    const bookingConfigs = {
        testdrive: { endpoint: "testdrive-bookings", statuses: ["pending", "confirmed", "completed", "cancelled"], tbodyIds: { pending: "testdriveTableBodyPending", confirmed: "testdriveTableBodyConfirmed", completed: "testdriveTableBodyCompleted", cancelled: "testdriveTableBodyCancelled" }, renderRow: (b) => `<tr><td>${b.booking_id}</td><td>${b.full_name}</td><td>${b.mobile}</td><td>${b.email}</td><td>${b.bike_model}</td><td>${new Date(b.preferred_date).toLocaleDateString()}</td><td>${b.preferred_time}</td><td>${createStatusDropdown(b.booking_id, b.status, "testdrive")}</td></tr>`},
        service: { endpoint: "service-bookings", statuses: ["pending", "confirmed", "completed", "cancelled"], tbodyIds: { pending: "serviceBookingsTableBodyPending", confirmed: "serviceBookingsTableBodyConfirmed", completed: "serviceBookingsTableBodyCompleted", cancelled: "serviceBookingsTableBodyCancelled" }, renderRow: (b) => `<tr><td>${b.booking_id}</td><td>${b.full_name}</td><td>${b.bike_model}</td><td>${b.service_type}</td><td>${new Date(b.preferred_date).toLocaleDateString()}</td><td>${createStatusDropdown(b.booking_id, b.status, "service")}</td></tr>`},
        bike: { endpoint: "bike-bookings", statuses: ["pending", "confirmed", "completed", "cancelled"], tbodyIds: { pending: "bookingsTableBodyPending", confirmed: "bookingsTableBodyConfirmed", completed: "bookingsTableBodyCompleted", cancelled: "bookingsTableBodyCancelled" }, renderRow: (b) => `<tr><td>${b.booking_id}</td><td>${b.bike_name}</td><td>${b.user_id || "Guest"}</td><td>${b.full_name}</td><td>${b.mobile}</td><td>${b.email}</td><td>${new Date(b.created_at).toLocaleString()}</td><td>${createStatusDropdown(b.booking_id, b.status, "bike")}</td></tr>`}
    };
    const createStatusDropdown = (id, currentStatus, type) => `<select class="form-select form-select-sm" data-action="update-status" data-id="${id}" data-type="${type}">${["pending", "confirmed", "completed", "cancelled"].map(s => `<option value="${s}" ${currentStatus === s ? "selected" : ""}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join("")}</select>`;
    const loadAndRenderBookings = async (config) => { const data = await fetchData(config.endpoint); config.statuses.forEach(status => { const tbody = document.getElementById(config.tbodyIds[status]); if(tbody) tbody.innerHTML = ""; }); data.forEach(item => { const tbody = document.getElementById(config.tbodyIds[item.status]); if(tbody) tbody.innerHTML += config.renderRow(item); }); };
    const loadTestDrives = () => loadAndRenderBookings(bookingConfigs.testdrive);
    const loadServiceBookings = () => loadAndRenderBookings(bookingConfigs.service);
    const loadBikeBookings = () => loadAndRenderBookings(bookingConfigs.bike);
    const bookingLoaders = { testdrive: loadTestDrives, service: loadServiceBookings, bike: loadBikeBookings };

    // --- Contacts ---
    const loadContacts = async () => {
        const contacts = await fetchData("contact-messages");
        document.getElementById("contactsTableBody").innerHTML = contacts.map(c => `
            <tr><td>${c.id}</td><td>${c.name}</td><td>${c.phone}</td><td>${c.email}</td><td>${c.subject}</td><td>${c.message}</td><td>${new Date(c.submitted_at).toLocaleString()}</td></tr>`).join("");
    };

    // --- Handle Form Submit Utility ---
    const handleFormSubmit = async (url, method, body, isFormData = false) => {
        try {
            const options = { method, body };
            if (!isFormData) {
                options.headers = { "Content-Type": "application/json" };
                options.body = JSON.stringify(body);
            }
            const response = await fetch(url, options);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "Request failed");
            return result;
        } catch (error) {
            console.error(`Error with ${method} ${url}:`, error);
            alert(`Error: ${error.message}`);
            return null;
        }
    };

    // --- Form Submissions ---
    document.getElementById("addBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (await handleFormSubmit(`${API_BASE_URL}/api/bikes`, "POST", new FormData(e.target), true)) {
            alert("Bike added successfully!"); e.target.reset(); loadBikes(); loadDashboard();
        }
    });
    document.getElementById("uploadImagesForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (await handleFormSubmit(`${API_BASE_URL}/api/bike-images`, "POST", new FormData(e.target), true)) {
            alert("Additional images uploaded successfully!"); e.target.reset();
        }
    });
    document.getElementById("editBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const bikeId = new FormData(e.target).get("id");
        if (await handleFormSubmit(`${API_BASE_URL}/api/bikes/${bikeId}`, "PUT", new FormData(e.target), true)) {
            alert("Bike updated successfully!"); editBikeModal.hide(); loadBikes();
        }
    });

    // --- Event Delegation for Clicks ---
    document.body.addEventListener("click", async (e) => {
        const { action, id } = e.target.dataset;
        if (!action) return;

        if (action === "delete-user" || action === "delete-bike") {
            const type = action === 'delete-user' ? 'user' : 'bike';
            document.getElementById('confirmationModalBody').innerText = `Are you sure you want to delete this ${type} (ID: ${id})?`;
            actionToConfirm = async () => {
                if (await handleFormSubmit(`${API_BASE_URL}/api/${type}s/${id}`, "DELETE")) {
                    if(type === 'user') loadUsers();
                    else { loadBikes(); loadDashboard(); }
                }
            };
            confirmationModal.show();
        }
        if (action === "edit-bike") {
            const bike = JSON.parse(e.target.dataset.bike);
            const form = document.getElementById("editBikeForm");
            form.id.value = bike.id;
            form.category_id.value = bike.category_id;
            form.name.value = bike.name;
            form.price.value = bike.price || "";
            form.engine.value = bike.engine || "";
            form.mileage.value = bike.mileage || "";
            form.thumbnail.value = bike.thumbnail || "";
            form.features.value = bike.features || "";
            const preview = document.getElementById("editBikeThumbnailPreview");
            preview.src = bike.thumbnail ? `/images/${bike.thumbnail}` : '';
            preview.style.display = bike.thumbnail ? "block" : "none";
            form.querySelector('[name="thumbnailFile"]').value = "";
            editBikeModal.show();
        }
    });

    // --- Confirmation Modal Logic ---
    document.getElementById("confirmDeleteButton").addEventListener("click", async () => {
        if (actionToConfirm) {
            await actionToConfirm();
            actionToConfirm = null;
        }
        confirmationModal.hide();
    });
    
    // --- Event Delegation for Changes ---
    document.body.addEventListener("change", async (e) => {
        const { action, id, type } = e.target.dataset;
        if (action === "update-status") {
            const status = e.target.value;
            if (await handleFormSubmit(`${API_BASE_URL}/api/${type}-bookings/${id}`, "PUT", { status })) {
                alert(`${type.charAt(0).toUpperCase() + type.slice(1)} booking #${id} status updated.`);
                if (bookingLoaders[type]) bookingLoaders[type]();
            }
        }
    });

    // --- Initial Load ---
    const initialize = async () => {
        showSection(window.location.hash || "#dashboardSection");
        loadDashboard();
        loadUsers();
        loadCategories();
        loadBikes();
        loadTestDrives();
        loadServiceBookings();
        loadBikeBookings();
        loadContacts();
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/check-new-bookings`);
            if (response.ok) {
                const initialIds = await response.json();
                lastKnownMaxIds.testdrive = initialIds.latestTestDriveId;
                lastKnownMaxIds.service = initialIds.latestServiceId;
                lastKnownMaxIds.bike = initialIds.latestBikeId;
            }
        } catch (error) {
            console.error("Failed to get initial max IDs:", error);
        }
        
        setInterval(checkForNewBookings, 20000);
    };

    initialize();
});

