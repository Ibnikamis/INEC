'use strict';

// Function to validate NIN using NIMC format
function validateNIN(nin) {
    // Check if the NIN is exactly 11 digits
    const ninPattern = /^(?!0)\d{11}$/;
    if (!ninPattern.test(nin)) {
        return false;
    }

    // Extract date of birth from NIN
    const year = parseInt(nin.slice(1, 3), 10);
    const month = parseInt(nin.slice(3, 5), 10);
    const day = parseInt(nin.slice(5, 7), 10);

    // Validate month and day
    if (month < 1 || month > 12 || day < 1 || day > 31) {
        return false;
    }

    // Current year for age calculation
    const currentYear = new Date().getUTCFullYear();
    const fullYear = (year < 30) ? currentYear - (currentYear % 100) + year + 2000 : currentYear - (currentYear % 100) + year + 1900;

    // Calculate age
    const age = currentYear - fullYear;
    if (age < 18) {
        return false;
    }

    return true;
}

module.exports = validateNIN;
