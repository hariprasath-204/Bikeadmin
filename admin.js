document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "";

    const sections = document.querySelectorAll(".page-section");
    const navLinks = document.querySelectorAll(".nav-links a");
    const editBikeModal = new bootstrap.Modal(document.getElementById("editBikeModal"));
    const uploadImagesModal = new bootstrap.Modal(document.getElementById("uploadImagesModal"));
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
            history.pushState(null, null, targetHash);
            showSection(targetHash);
        });
    });

    window.addEventListener('popstate', () => showSection(window.location.hash));

    // --- Data Loaders ---
    const fetchData = async (endpoint) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/${endpoint}`, {
                cache: 'no-cache'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(`Failed to fetch ${endpoint}:`, error);
            return [];
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

    const renderBikeRow = (bike) => {
        return `
            <td>${bike.id}</td>
            <td>${bike.category_name || 'N/A'}</td>
            <td>${bike.name}</td>
            <td>${bike.price || ''}</td>
            <td>${bike.engine || ''}</td>
            <td>${bike.mileage || ''}</td>
            <td>${bike.thumbnail ? `<img src="images/${bike.thumbnail}" alt="${bike.name}" width="80"/>` : 'No Image'}</td>
            <td class="d-flex flex-column g-2">
                <button class="btn btn-sm btn-primary mb-1" data-action="edit-bike" data-bike='${JSON.stringify(bike)}'>Edit Details</button>
                <button class="btn btn-sm btn-info mb-1" data-action="add-images" data-id="${bike.id}">Add Images</button>
                <button class="btn btn-sm btn-danger" data-action="delete-bike" data-id="${bike.id}">Delete Bike</button>
            </td>
        `;
    };

    const loadBikes = async () => {
        const bikes = await fetchData("bikes");
        const tbody = document.getElementById("bikesTableBody");
        tbody.innerHTML = bikes.map(b => `<tr id="bike-row-${b.id}">${renderBikeRow(b)}</tr>`).join('');
    };

    const createStatusDropdown = (id, currentStatus, type) => {
        const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
        return `
            <select class="form-select form-select-sm" data-action="update-status" data-id="${id}" data-type="${type}">
                ${statuses.map(s => `<option value="${s}" ${currentStatus === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
            </select>`;
    };
    
    // ... Other data loaders for bookings and contacts ...

    // --- Form Submissions & Event Delegation ---
    const handleFormSubmit = async (url, method, body, isFormData = false) => {
        try {
            const options = { method, body };
            if (!isFormData) {
                options.headers = { "Content-Type": "application/json" };
                options.body = JSON.stringify(body);
            }
            const response = await fetch(url, options);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Request failed');
            }
            // Handle cases where there might be no JSON body in response
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                return await response.json();
            }
            return { success: true };

        } catch (error) {
            console.error(`Error with ${method} ${url}:`, error);
            alert(`Error: ${error.message}`);
            return null;
        }
    };

    // ✅ FINAL VERSION: This listener now instantly adds the new bike row to the table.
    document.getElementById("addBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newBike = await handleFormSubmit(`${API_BASE_URL}/api/bikes`, 'POST', formData, true);
        
        if (newBike) {
            alert("Bike added successfully!");
            e.target.reset();

            const tbody = document.getElementById("bikesTableBody");
            const newRow = document.createElement('tr');
            newRow.id = `bike-row-${newBike.id}`;
            newRow.innerHTML = renderBikeRow(newBike);

            tbody.prepend(newRow); // Add new bike to the top of the table
            loadDashboard(); // Update dashboard counts
        }
    });

    document.getElementById("uploadImagesFormModal").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const result = await handleFormSubmit(`${API_BASE_URL}/api/bike-images`, 'POST', formData, true);
        if (result) {
            alert("Images uploaded successfully!");
            e.target.reset();
            uploadImagesModal.hide();
        }
    });

    document.getElementById("editBikeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const bikeId = formData.get('id');
        const result = await handleFormSubmit(`${API_BASE_URL}/api/bikes/${bikeId}`, 'PUT', formData, true);
        if (result && result.success) {
            alert("Bike updated successfully!");
            editBikeModal.hide();
            // Since we don't get the updated bike object back, we reload the whole list
            loadBikes();
        }
    });

    document.body.addEventListener("click", async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const { action, id } = button.dataset;
        if (!action) return;

        if (action === "delete-user") {
            if (confirm(`Delete user #${id}?`)) {
                if (await handleFormSubmit(`${API_BASE_URL}/api/users/${id}`, 'DELETE')) {
                     loadUsers();
                     loadDashboard();
                }
            }
        }
        if (action === "delete-bike") {
            if (confirm(`Delete bike #${id}? This will also delete its images and features.`)) {
                if (await handleFormSubmit(`${API_BASE_URL}/api/bikes/${id}`, 'DELETE')) {
                    document.getElementById(`bike-row-${id}`)?.remove();
                    loadDashboard();
                }
            }
        }
        if (action === "edit-bike") {
            const bike = JSON.parse(button.dataset.bike);
            const form = document.getElementById('editBikeForm');
            form.id.value = bike.id;
            form.category_id.value = bike.category_id;
            form.name.value = bike.name;
            form.price.value = bike.price || '';
            form.engine.value = bike.engine || '';
            form.mileage.value = bike.mileage || '';
            form.thumbnail.value = bike.thumbnail || '';
            form.features.value = bike.features || '';

            const preview = document.getElementById('editBikeThumbnailPreview');
            if (bike.thumbnail) {
                preview.src = `images/${bike.thumbnail}`;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
            }
            form.querySelector('[name="thumbnailFile"]').value = '';
            editBikeModal.show();
        }
        if (action === "add-images") {
            document.getElementById('uploadImagesBikeIdLabel').textContent = id;
            document.getElementById('uploadImagesBikeId').value = id;
            uploadImagesModal.show();
        }
    });

    // ... Other event listeners for booking status changes ...

    // --- Initial Load ---
    const initialize = () => {
        showSection(window.location.hash || "#dashboardSection");
        loadDashboard();
        loadUsers();
        loadCategories();
        loadBikes();
        // loadTestDrives();
        // loadServiceBookings();
        // loadBikeBookings();
        // loadContacts();
    };

    initialize();
});