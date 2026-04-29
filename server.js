const express = require('express');
const multer = require('multer');
const path = require('path');
const { sql } = require('@vercel/postgres');
const { put } = require('@vercel/blob');

const app = express();
const port = process.env.PORT || 3000;

// Configure Multer for file uploads (Memory Storage for Serverless)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database table (Postgres syntax)
async function initDb() {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS registrations (
                id SERIAL PRIMARY KEY,
                fullName VARCHAR(255),
                dob DATE,
                gender VARCHAR(50),
                state VARCHAR(100),
                localgov VARCHAR(100),
                address TEXT,
                number VARCHAR(50),
                email VARCHAR(255),
                nin VARCHAR(20),
                idCardPath TEXT,
                registrationDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        console.log('Postgres database initialized.');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}
// Vercel serverless functions will run this when spun up
initDb();

// Routes
app.post('/register', upload.single('Idcard'), async (req, res) => {
    try {
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
        const secretKey = process.env.RECAPTCHA_SECRET_KEY || '6LeHqtAsAAAAAM7laYx_ZWqE3LuYEyLQjcLTbcam';
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${captchaResponse}`;

        const captchaFetch = await fetch(verifyUrl, { method: 'POST' });
        const data = await captchaFetch.json();

        if (!data.success) {
            return res.status(400).send("Captcha verification failed. Are you a robot?");
        }

        // 3. Upload File to Vercel Blob (if provided)
        let idCardPath = null;
        if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = `idcards/${uniqueSuffix}${path.extname(req.file.originalname)}`;

            // Upload the memory buffer to Vercel Blob
            const blob = await put(filename, req.file.buffer, {
                access: 'public',
            });
            idCardPath = blob.url; // Save the public URL from Vercel Blob
        }

        // 4. Save to Postgres Database
        await sql`
            INSERT INTO registrations (
                fullName, dob, gender, state, localgov, address, number, email, nin, idCardPath
            ) VALUES (
                ${Personalinfo}, ${DOB}, ${gender}, ${state}, ${localgov}, ${address}, ${number}, ${email}, ${nin}, ${idCardPath}
            )
        `;

        console.log(`A new registration has been inserted.`);
        // Redirect to success page
        res.redirect('/success.html');

    } catch (error) {
        console.error("Error during registration:", error);
        res.status(500).send("An error occurred during registration. Check server logs.");
    }
});

// Export for Vercel serverless, listen for local dev
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
} else {
    module.exports = app;
}
