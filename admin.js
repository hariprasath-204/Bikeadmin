document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = ""; // Use relative path since it's served from the same origin

    const sections = document.querySelectorAll(".page-section");
    const navLinks = document.querySelectorAll(".nav-links a");
    const editBikeModal = new bootstrap.Modal(document.getElementById("editBikeModal"));
    let categoriesCache = [];

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
            history.pushState(null, null, targetHash); // Update URL without reloading
            showSection(targetHash);
        });
    });
    
    // Handle back/forward browser buttons
    window.addEventListener('popstate', () => showSection(window.location.hash));

    // --- Data Loaders ---
    const fetchData = async (endpoint) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/${endpoint}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch ${endpoint}:`, error);
            return []; // Return empty array on error to prevent crashes
        }
    };

    const loadDashboard = async () => {
        const data = await fetchData("dashboard");
        document.getElementById("totalUsers").innerText = data.users || 0;
        document.getElementById("totalBikes").innerText = data.bikes || 0;
        document.getElementById("totalTestDrives").innerText = data.testDrives || 0;
        document.getElementById("totalServiceBookings").innerText = data.serviceBookings || 0;
        document.getElementById("totalBikeBookings").innerText = data.bikeBookings || 0;
        document.getElementById("totalContacts").innerText = data.contacts || 0;
    };

    const loadUsers = async () => {
        const users = await fetchData("users");
        const tbody = document.getElementById("usersTableBody");
        tbody.innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.first_name} ${u.last_name}</td>
                <td>${u.email}</td>
                <td>${u.phone}</td>
                <td>${u.gender}</td>
                <td>${u.role}</td>
                <td>${new Date(u.created_at).toLocaleString()}</td>
                <td><button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u.id}">Delete</button></td>
            </tr>`).join('');
    };

    const loadCategories = async () => {
        categoriesCache = await fetchData("categories");
        const selects = document.querySelectorAll("#bikeCategoryAdd, #editBikeCategory");
        selects.forEach(select => {
            select.innerHTML = '<option value="">Select Category</option>';
            select.innerHTML += categoriesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        });
    };

    const loadBikes = async () => {
        const bikes = await fetchData("bikes");
        const tbody = document.getElementById("bikesTableBody");
        tbody.innerHTML = bikes.map(b => `
            <tr>
                <td>${b.id}</td>
                <td>${b.category_name || 'N/A'}</td>
                <td>${b.name}</td>
                <td>${b.price || ''}</td>
                <td>${b.engine || ''}</td>
                <td>${b.mileage || ''}</td>
                <td>${b.thumbnail ? `<img src="images/${b.thumbnail}" alt="${b.name}" width="80"/>` : 'No Image'}</td>
                <td>
                    <button class="btn btn-sm btn-primary" data-action="edit-bike" data-bike='${JSON.stringify(b)}'>Edit</button>
                    <button class="btn btn-sm btn-danger" data-action="delete-bike" data-id="${b.id}">Delete</button>
                </td>
            </tr>`).join('');
    };
    
    const createStatusDropdown = (id, currentStatus, type) => {
        const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
        return `
            <select class="form-select form-select-sm" data-action="update-status" data-id="${id}" data-type="${type}">
                ${statuses.map(s => `<option value="${s}" ${currentStatus === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>`;
    };
    
    /**
     * Generic function to load and render different types of bookings.
     * @param {object} config - Configuration for the booking type.
     * @param {string} config.endpoint - The API endpoint to fetch data from.
     * @param {string[]} config.statuses - An array of status strings (e.g., ['pending', 'confirmed']).
     * @param {object} config.tbodyIds - A map of status to table body element IDs.
     * @param {function} config.renderRow - A function that takes a data item and returns an HTML string for a table row.
     */
    const loadAndRenderBookings = async (config) => {
        const data = await fetchData(config.endpoint);
        const bodies = {};
        config.statuses.forEach(status => {
            bodies[status] = document.getElementById(config.tbodyIds[status]);
        });

        Object.values(bodies).forEach(body => { if (body) body.innerHTML = ''; });
        
        data.forEach(item => {
            const rowHtml = config.renderRow(item);
            if (bodies[item.status]) {
                bodies[item.status].innerHTML += rowHtml;
            }
        });
    };

    // --- Booking Configurations ---
    const bookingConfigs = {
        testdrive: {
            endpoint: 'testdrive-bookings',
            statuses: ['pending', 'confirmed', 'completed', 'cancelled'],
            tbodyIds: {
                pending: 'testdriveTableBodyPending',
                confirmed: 'testdriveTableBodyConfirmed',
                completed: 'testdriveTableBodyCompleted',
                cancelled: 'testdriveTableBodyCancelled',
            },
            renderRow: (b) => `
                <tr>
                    <td>${b.booking_id}</td><td>${b.full_name}</td><td>${b.mobile}</td><td>${b.email}</td>
                    <td>${b.bike_model}</td><td>${new Date(b.preferred_date).toLocaleDateString()}</td><td>${b.preferred_time}</td>
                    <td>${createStatusDropdown(b.booking_id, b.status, 'testdrive')}</td>
                </tr>`
        },
        service: {
            endpoint: 'service-bookings',
            statuses: ['pending', 'confirmed', 'completed', 'cancelled'],
            tbodyIds: {
                pending: 'serviceBookingsTableBodyPending',
                confirmed: 'serviceBookingsTableBodyConfirmed',
                completed: 'serviceBookingsTableBodyCompleted',
                cancelled: 'serviceBookingsTableBodyCancelled',
            },
            renderRow: (b) => `
                <tr>
                    <td>${b.booking_id}</td><td>${b.full_name}</td><td>${b.bike_model}</td><td>${b.service_type}</td>
                    <td>${new Date(b.preferred_date).toLocaleDateString()}</td><td>${createStatusDropdown(b.booking_id, b.status, 'service')}</td>
                </tr>`
        },
        bike: {
            endpoint: 'bike-bookings',
            statuses: ['pending', 'confirmed', 'completed', 'cancelled'],
            tbodyIds: {
                pending: 'bookingsTableBodyPending',
                confirmed: 'bookingsTableBodyConfirmed',
                completed: 'bookingsTableBodyCompleted',
                cancelled: 'bookingsTableBodyCancelled',
            },
            renderRow: (b) => `
                <tr>
                    <td>${b.booking_id}</td><td>${b.bike_name}</td><td>${b.user_id || 'Guest'}</td><td>${b.full_name}</td>
                    <td>${b.mobile}</td><td>${b.email}</td><td>${new Date(b.created_at).toLocaleString()}</td>
                    <td>${createStatusDropdown(b.booking_id, b.status, 'bike')}</td>
                </tr>`
        }
    };

    const loadTestDrives = () => loadAndRenderBookings(bookingConfigs.testdrive);
    const loadServiceBookings = () => loadAndRenderBookings(bookingConfigs.service);
    const loadBikeBookings = () => loadAndRenderBookings(bookingConfigs.bike);

    const bookingLoaders = {
        testdrive: loadTestDrives,
        service: loadServiceBookings,
        bike: loadBikeBookings,
    };

    const loadContacts = async () => {
        const contacts = await fetchData("contact-messages");
        document.getElementById("contactsTableBody").innerHTML = contacts.map(c => `
            <tr>
                <td>${c.id}</td><td>${c.name}</td><td>${c.phone}</td><td>${c.email}</td>
                <td>${c.subject}</td><td>${c.message}</td><td>${new Date(c.submitted_at).toLocaleString()}</td>
            </tr>`).join('');
    };
    
    // --- Form Submissions & Event Delegation ---
    const handleFormSubmit = async (url, method, body, isFormData = false) => {
        try {
            const options = { method, body };
            if (!isFormData) {
                options.headers = { "Content-Type": "application/json" };
                options.body = JSON.stringify(body);
            }
            const response = await fetch(url, options);
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Request failed');
            return result;
        } catch (error) {
            console.error(`Error with ${method} ${url}:`, error);
            alert(`Error: ${error.message}`);
            return null;
        }
    };

    document.getElementById("addBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await handleFormSubmit(`${API_BASE_URL}/api/bikes`, 'POST', formData, true);
        if (result) {
            alert("Bike added successfully!");
            e.target.reset();
            loadBikes();
            loadDashboard();
        }
    });

    document.getElementById("uploadImagesForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await handleFormSubmit(`${API_BASE_URL}/api/bike-images`, 'POST', formData, true);
        if (result) {
            alert("Images uploaded successfully!");
            e.target.reset();
        }
    });

    document.getElementById("editBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const bikeId = formData.get('id');
        const result = await handleFormSubmit(`${API_BASE_URL}/api/bikes/${bikeId}`, 'PUT', formData, true);
        if (result) {
            alert("Bike updated successfully!");
            editBikeModal.hide();
            loadBikes();
        }
    });

    document.body.addEventListener("click", async (e) => {
        const { action, id } = e.target.dataset;
        if (!action) return;

        if (action === "delete-user") {
            if (confirm(`Delete user #${id}?`)) {
                if (await handleFormSubmit(`${API_BASE_URL}/api/users/${id}`, 'DELETE')) loadUsers();
            }
        }
        if (action === "delete-bike") {
            if (confirm(`Delete bike #${id}? This will also delete its images and features.`)) {
                if (await handleFormSubmit(`${API_BASE_URL}/api/bikes/${id}`, 'DELETE')) {
                    loadBikes();
                    loadDashboard();
                }
            }
        }
        if (action === "edit-bike") {
            const bike = JSON.parse(e.target.dataset.bike);
            const form = document.getElementById('editBikeForm');
            form.id.value = bike.id;
            form.category_id.value = bike.category_id;
            form.name.value = bike.name;
            form.price.value = bike.price || '';
            form.engine.value = bike.engine || '';
            form.mileage.value = bike.mileage || '';
            form.thumbnail.value = bike.thumbnail || '';
            form.features.value = bike.features || ''; // Populate features

            const preview = document.getElementById('editBikeThumbnailPreview');
            if (bike.thumbnail) {
                preview.src = `images/${bike.thumbnail}`;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
            form.querySelector('[name="thumbnailFile"]').value = ''; // Clear file input
            editBikeModal.show();
        }
    });
    
    document.body.addEventListener('change', async (e) => {
        const { action, id, type } = e.target.dataset;
        if (action === 'update-status') {
            const status = e.target.value;
            const result = await handleFormSubmit(`${API_BASE_URL}/api/${type}-bookings/${id}`, 'PUT', { status });
            if (result && result.success) {
                alert(`${type.charAt(0).toUpperCase() + type.slice(1)} booking #${id} status updated to ${status}.`);
            } else {
                alert(`Failed to update status for booking #${id}.`);
            }
            
            // Reload the relevant tables to move the item to the correct tab
            if (bookingLoaders[type]) {
                bookingLoaders[type]();
            }
        }
    });

    // --- Initial Load ---
    const initialize = () => {
        showSection(window.location.hash || "#dashboardSection");
        loadDashboard();
        loadUsers();
        loadCategories();
        loadBikes();
        loadTestDrives();
        loadServiceBookings();
        loadBikeBookings();
        loadContacts();
    };

    initialize();
});

