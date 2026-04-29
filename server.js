const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Setup database
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create registrations table
        db.run(`CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fullName TEXT,
            dob TEXT,
            gender TEXT,
            state TEXT,
            localgov TEXT,
            address TEXT,
            number TEXT,
            email TEXT,
            nin TEXT,
            idCardPath TEXT,
            registrationDate DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) {
                console.error("Error creating table", err);
            }
        });
    }
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Serve static files from 'public' directory
app.use(express.static('public'));
// Optional: allow viewing uploaded images directly
app.use('/uploads', express.static('uploads'));

// Routes
app.post('/register', upload.single('Idcard'), async (req, res) => {
    const {
        Personalinfo,
        DOB,
        gender,
        state,
        localgov,
        address,
        number,
        email,
        nin
    } = req.body;

    const captchaResponse = req.body['g-recaptcha-response'];

    // 1. Check if captcha was checked
    if (!captchaResponse) {
        return res.status(400).send("Please complete the 'I'm not a robot' captcha.");
    }

    // 2. Verify with Google's API
    const secretKey = '6LeHqtAsAAAAAM7laYx_ZWqE3LuYEyLQjcLTbcam';
    // const secretKey = '6LetstAsAAAAAFQuxjKPDa7SKK69ocI6tX6WCmpj';
    const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;

    try {
        const response = await fetch(verifyUrl, { method: 'POST' });
        const data = await response.json();

        if (!data.success) {
            return res.status(400).send("Captcha verification failed. Are you a robot?");
        }
    } catch (error) {
        console.error("Captcha error:", error);
        return res.status(500).send("An error occurred during captcha verification.");
    }

    // Captcha passed! Proceed with database insertion...
    const idCardPath = req.file ? req.file.path : null;

    const sql = `INSERT INTO registrations (
        fullName, dob, gender, state, localgov, address, number, email, nin, idCardPath
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const params = [
        Personalinfo, DOB, gender, state, localgov, address, number, email, nin, idCardPath
    ];

    db.run(sql, params, function (err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("An error occurred during registration.");
        }
        console.log(`A row has been inserted with rowid ${this.lastID}`);
        // Redirect to success page
        res.redirect('/success.html');
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
