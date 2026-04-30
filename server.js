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

/**
 * VALIDATE NIGERIAN NIN FORMAT AND CHECKSUM
 * NIN Structure: 11 digits with Luhn algorithm validation
 */
function validateNINFormat(nin) {
    // Must be exactly 11 digits
    if (!/^\d{11}$/.test(nin)) {
        return {
            isValid: false,
            error: 'NIN must be exactly 11 digits.'
        };
    }

    // Luhn Algorithm validation for Nigerian NIN
    let total = 0;
    const weights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    
    for (let i = 0; i < 10; i++) {
        total += parseInt(nin[i]) * weights[i];
    }
    
    const checkDigit = (11 - (total % 11)) % 11;
    
    if (checkDigit !== parseInt(nin[10])) {
        return {
            isValid: false,
            error: 'Invalid NIN checksum. This is not a valid NIN number.'
        };
    }

    return { isValid: true, error: null };
}

/**
 * EXTRACT DATE OF BIRTH FROM NIN AND VERIFY AGE
 * NIN DOB Format (YYMMDD): First 6 digits represent Year, Month, Day
 */
function verifyAgeFromNIN(nin) {
    try {
        // Extract date components (first 6 digits)
        const yearStr = nin.substring(0, 2);
        const monthStr = nin.substring(2, 4);
        const dayStr = nin.substring(4, 6);

        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const day = parseInt(dayStr);

        // Validate month and day ranges
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return {
                isValid: false,
                age: null,
                error: 'Invalid date of birth in NIN.'
            };
        }

        // Determine century (if year > current year's last 2 digits, assume 19XX, else 20XX)
        const currentYear = new Date().getFullYear();
        const currentYearLastTwoDigits = currentYear % 100;
        const fullYear = year > currentYearLastTwoDigits ? 1900 + year : 2000 + year;

        // Create date object
        const dobDate = new Date(fullYear, month - 1, day); // Month is 0-indexed

        // Verify the date is valid
        if (dobDate.getMonth() !== month - 1 || dobDate.getDate() !== day) {
            return {
                isValid: false,
                age: null,
                error: 'Invalid date in NIN.'
            };
        }

        // Calculate age
        const today = new Date();
        let age = today.getFullYear() - dobDate.getFullYear();
        const monthDifference = today.getMonth() - dobDate.getMonth();
        
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < dobDate.getDate())) {
            age--;
        }

        // Check if age >= 18
        if (age < 18) {
            return {
                isValid: false,
                age: age,
                error: `You are ${age} years old. You must be at least 18 years old to register.`
            };
        }

        return {
            isValid: true,
            age: age,
            dob: dobDate.toISOString().split('T')[0], // Return as YYYY-MM-DD
            error: null
        };
    } catch (error) {
        console.error('Error verifying age from NIN:', error);
        return {
            isValid: false,
            age: null,
            error: 'Error processing NIN. Please try again.'
        };
    }
}

// Check if NIN already registered
async function ninExists(nin) {
    try {
        const result = await sql`
            SELECT id FROM registrations WHERE nin = ${nin}
        `;
        return result.rows.length > 0;
    } catch (error) {
        console.error('Error checking NIN:', error);
        return false;
    }
}

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

        // 3. VALIDATE NIN FORMAT AND CHECKSUM
        const ninFormatValidation = validateNINFormat(nin);
        if (!ninFormatValidation.isValid) {
            return res.status(400).send(ninFormatValidation.error);
        }

        // 4. VERIFY AGE FROM NIN (must be >= 18)
        const ageVerification = verifyAgeFromNIN(nin);
        if (!ageVerification.isValid) {
            return res.status(400).send(ageVerification.error);
        }

        // 5. CHECK IF NIN ALREADY REGISTERED
        if (await ninExists(nin)) {
            return res.status(400).send("This NIN has already been registered.");
        }

        // 6. Upload File to Vercel Blob (if provided)
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

        // 7. Save to Postgres Database
        await sql`
            INSERT INTO registrations (
                fullName, dob, gender, state, localgov, address, number, email, nin, idCardPath
            ) VALUES (
                ${Personalinfo}, ${ageVerification.dob}, ${gender}, ${state}, ${localgov}, ${address}, ${number}, ${email}, ${nin}, ${idCardPath}
            )
        `;

        console.log(`A new registration has been inserted. NIN: ${nin}, Age: ${ageVerification.age}`);
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