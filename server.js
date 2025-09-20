// ----------------------
// Load Dependencies
// ----------------------
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
require("dotenv").config();

// ----------------------
// App Setup
// ----------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the project's root directory
app.use(express.static(__dirname));

// ----------------------
// MySQL Connection Pool
// ----------------------
const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST || "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    user: process.env.DB_USER || "29AbDUEYRffWpr9.root",
    password: process.env.DB_PASS || "Y6CltcwzarqPh1ga",
    database: process.env.DB_NAME || "rkbikes",
    port: process.env.DB_PORT || 4000,
    ssl: { rejectUnauthorized: true },
});

db.getConnection()
    .then(conn => {
        console.log("✅ Connected to MySQL Database");
        conn.release();
    })
    .catch(err => {
        console.error("❌ MySQL Connection Failed:", err);
        process.exit(1);
    });

// ----------------------
// Multer File Upload Setup
// ----------------------
const imagesDir = path.join(__dirname, "images");
fs.mkdirSync(imagesDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, imagesDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage });

// ----------------------
// Helper Function for Features
// ----------------------
const processFeatures = async (bikeId, featuresString) => {
    await db.query("DELETE FROM bike_features WHERE bike_id = ?", [bikeId]);
    if (featuresString && featuresString.trim() !== "") {
        const featureList = featuresString.split(',').map(f => f.trim()).filter(f => f);
        if (featureList.length > 0) {
            const featurePromises = featureList.map(feature => {
                return db.query("INSERT INTO bike_features (bike_id, feature) VALUES (?, ?)", [bikeId, feature]);
            });
            await Promise.all(featurePromises);
        }
    }
};

// ----------------------
// API Endpoints
// ----------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- DASHBOARD ---
app.get("/api/dashboard", async (req, res) => {
    try {
        const [[{ total: users }]] = await db.query("SELECT COUNT(*) as total FROM users");
        const [[{ total: bikes }]] = await db.query("SELECT COUNT(*) as total FROM bikes");
        const [[{ total: testDrives }]] = await db.query("SELECT COUNT(*) as total FROM testdrive_bookings");
        const [[{ total: serviceBookings }]] = await db.query("SELECT COUNT(*) as total FROM service_bookings");
        const [[{ total: bikeBookings }]] = await db.query("SELECT COUNT(*) as total FROM bookings");
        const [[{ total: contacts }]] = await db.query("SELECT COUNT(*) as total FROM contact_messages");
        res.json({ users, bikes, testDrives, serviceBookings, bikeBookings, contacts });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/api/booking-stats", async (req, res) => {
    try {
        const tables = ['bookings', 'testdrive_bookings', 'service_bookings'];
        let totals = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
        for (const table of tables) {
            const [results] = await db.query(`SELECT status, COUNT(*) as count FROM ${table} GROUP BY status`);
            results.forEach(row => {
                if (totals.hasOwnProperty(row.status)) {
                    totals[row.status] += row.count;
                }
            });
        }
        res.json(totals);
    } catch (err) {
        console.error("Error fetching booking stats:", err);
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/api/recent-testdrives", async (req, res) => {
    try {
        const [results] = await db.query("SELECT booking_id, full_name, bike_model, preferred_date, status FROM testdrive_bookings ORDER BY booking_id DESC LIMIT 5");
        res.json(results);
    } catch (err) {
        console.error("Error fetching recent test drives:", err);
        res.status(500).json({ error: "Database error" });
    }
});

app.get("/api/check-new-bookings", async (req, res) => {
    try {
        const [testDriveResult] = await db.query("SELECT MAX(booking_id) as max_id FROM testdrive_bookings");
        const [serviceResult] = await db.query("SELECT MAX(booking_id) as max_id FROM service_bookings");
        const [bikeResult] = await db.query("SELECT MAX(booking_id) as max_id FROM bookings");
        res.json({
            latestTestDriveId: testDriveResult[0].max_id || 0,
            latestServiceId: serviceResult[0].max_id || 0,
            latestBikeId: bikeResult[0].max_id || 0
        });
    } catch (err) {
        console.error("Error checking for new bookings:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// --- USERS ---
app.get("/api/users", async (req, res) => {
    try {
        const [users] = await db.query("SELECT id, first_name, last_name, email, phone, gender, role, created_at FROM users ORDER BY id DESC");
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/users/:id", async (req, res) => {
    try {
        await db.query("DELETE FROM users WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "User deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete user" });
    }
});

// --- CATEGORIES ---
app.get("/api/categories", async (req, res) => {
    try {
        const [categories] = await db.query("SELECT * FROM categories ORDER BY name");
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- BIKES ---
app.get("/api/bikes", async (req, res) => {
    try {
        const sql = `
            SELECT 
                b.id, b.category_id, c.name AS category_name, b.name, 
                b.price, b.engine, b.mileage, b.thumbnail
            FROM bikes b 
            LEFT JOIN categories c ON b.category_id = c.id
            ORDER BY b.id DESC`;
        const [bikes] = await db.query(sql);
        const bikesWithFeatures = await Promise.all(
            bikes.map(async (bike) => {
                const [featuresResult] = await db.query("SELECT feature FROM bike_features WHERE bike_id = ?", [bike.id]);
                const features = featuresResult.map(f => f.feature).join(', ');
                return { ...bike, features };
            })
        );
        res.json(bikesWithFeatures);
    } catch (err) {
        console.error("Error fetching bikes:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/bikes", upload.single('thumbnailFile'), async (req, res) => {
    const { category_id, name, price, engine, mileage, features } = req.body;
    const thumbnail = req.file ? req.file.filename : null;
    if (!category_id || !name) {
        return res.status(400).json({ error: "Category and name are required" });
    }
    try {
        const sql = `INSERT INTO bikes (category_id, name, price, engine, mileage, thumbnail) VALUES (?, ?, ?, ?, ?, ?)`;
        const [result] = await db.query(sql, [category_id, name, price, engine, mileage, thumbnail]);
        await processFeatures(result.insertId, features);
        res.status(201).json({ message: "Bike added", bikeId: result.insertId });
    } catch (err) {
        console.error("Error adding bike:", err);
        res.status(500).json({ error: "Failed to add bike" });
    }
});

app.put("/api/bikes/:id", upload.single('thumbnailFile'), async (req, res) => {
    const { category_id, name, price, engine, mileage, features } = req.body;
    const id = req.params.id;
    let newThumbnail = req.body.thumbnail; 

    if (req.file) {
        newThumbnail = req.file.filename;
        if (req.body.thumbnail) { 
            fs.unlink(path.join(imagesDir, req.body.thumbnail), (err) => {
                if (err) console.error("Error deleting old thumbnail file:", err);
            });
        }
    }

    try {
        const sql = `UPDATE bikes SET category_id=?, name=?, price=?, engine=?, mileage=?, thumbnail=? WHERE id=?`;
        await db.query(sql, [category_id, name, price, engine, mileage, newThumbnail, id]);
        await processFeatures(id, features);
        res.json({ success: true, message: "Bike updated" });
    } catch (err) {
        console.error("Error updating bike:", err);
        res.status(500).json({ error: "Failed to update bike" });
    }
});

app.delete("/api/bikes/:id", async (req, res) => {
    const bikeId = req.params.id;
    try {
        const [[bike]] = await db.query("SELECT thumbnail FROM bikes WHERE id = ?", [bikeId]);
        if (bike && bike.thumbnail) {
            fs.unlink(path.join(imagesDir, bike.thumbnail), (err) => {
                if (err) console.error("Error deleting thumbnail file:", err);
            });
        }
        await db.query("DELETE FROM bike_images WHERE bike_id = ?", [bikeId]);
        await db.query("DELETE FROM bike_features WHERE bike_id = ?", [bikeId]);
        await db.query("DELETE FROM bikes WHERE id = ?", [bikeId]);
        res.json({ success: true, message: "Bike deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete bike" });
    }
});

app.post("/api/bike-images", upload.array("images"), async (req, res) => {
    const { bikeId } = req.body;
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No images uploaded" });
    }
    try {
        const insertPromises = req.files.map(file => {
            return db.query("INSERT INTO bike_images (bike_id, image_url) VALUES (?, ?)", [bikeId, file.filename]);
        });
        await Promise.all(insertPromises);
        res.json({ success: true, message: "Images uploaded successfully" });
    } catch (err) {
        console.error("Error uploading additional images:", err)
        res.status(500).json({ error: "Server error while uploading images" });
    }
});

// --- BOOKINGS (TEST DRIVE, SERVICE, BIKE) ---
const bookingRoutes = [
    { name: 'testdrive', table: 'testdrive_bookings' },
    { name: 'service', table: 'service_bookings' },
    { name: 'bike', table: 'bookings' }
];
bookingRoutes.forEach(({ name, table }) => {
    app.get(`/api/${name}-bookings`, async (req, res) => {
        try {
            const [results] = await db.query(`SELECT * FROM ${table} ORDER BY booking_id DESC`);
            res.json(results);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.put(`/api/${name}-bookings/:id`, async (req, res) => {
        const { status } = req.body;
        try {
            await db.query(`UPDATE ${table} SET status = ? WHERE booking_id = ?`, [status, req.params.id]);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
});

// --- CONTACT MESSAGES ---
app.get("/api/contact-messages", async (req, res) => {
    try {
        const [messages] = await db.query("SELECT * FROM contact_messages ORDER BY id DESC");
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

