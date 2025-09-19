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

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));



// ----------------------
// MySQL Connection Pool
// ----------------------
const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST || "gateway01.ap-southeast-1.prod.aws.tidbcloud.com",
    user: process.env.DB_USER || "29AbDUEYRffWpr9.root",
    password: process.env.DB_PASS || "Y6CltcwzarqPh1ga",
    database: process.env.DB_NAME || "rkbikes",
    port: process.env.DB_PORT || 4000, // TiDB Cloud default
    ssl: { rejectUnauthorized: true }, // ✅ required for TiDB
});

// Test the connection
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
const imagesDir = path.join(__dirname, "public", "images");
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
    // First, delete all existing features for this bike to ensure a clean update
    await db.query("DELETE FROM bike_features WHERE bike_id = ?", [bikeId]);

    // If a non-empty features string is provided, insert the new features
    if (featuresString && featuresString.trim() !== "") {
        const featureList = featuresString.split(',').map(f => f.trim()).filter(f => f); // a, b, ,, c -> ['a', 'b', 'c']
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

// --- ROOT ---
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
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
        res.json({ success: true, message: "User deleted successfully" });
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
                b.price, b.engine, b.mileage, b.thumbnail,
                (SELECT GROUP_CONCAT(f.feature SEPARATOR ', ') FROM bike_features f WHERE f.bike_id = b.id) AS features
            FROM bikes b 
            LEFT JOIN categories c ON b.category_id = c.id
            GROUP BY b.id
            ORDER BY b.id DESC`;
        const [bikes] = await db.query(sql);
        res.json(bikes);
    } catch (err) {
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
        
        // Process features for the newly created bike
        await processFeatures(result.insertId, features);

        res.status(201).json({ message: "Bike and features added successfully", bikeId: result.insertId });
    } catch (err) {
        console.error("Error adding bike:", err);
        res.status(500).json({ error: "Failed to add bike" });
    }
});

app.put("/api/bikes/:id", upload.single('thumbnailFile'), async (req, res) => {
    const { category_id, name, price, engine, mileage, thumbnail, features } = req.body;
    const id = req.params.id;
    let newThumbnail = thumbnail;

    if (req.file) {
        newThumbnail = req.file.filename;
        if (thumbnail) { 
            fs.unlink(path.join(imagesDir, thumbnail), (err) => {
                if (err) console.error("Error deleting old thumbnail file:", err);
            });
        }
    }

    try {
        // Update bike details
        const sql = `UPDATE bikes SET category_id=?, name=?, price=?, engine=?, mileage=?, thumbnail=? WHERE id=?`;
        await db.query(sql, [category_id, name, price, engine, mileage, newThumbnail, id]);

        // Process features for the updated bike
        await processFeatures(id, features);

        res.json({ success: true, message: "Bike and features updated successfully" });
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
        res.json({ success: true, message: "Bike and related data deleted" });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete bike" });
    }
});

// --- BIKE IMAGES (Additional) ---
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

const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
});


