import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from server root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Override MONGO_URI for test database
process.env.MONGO_URI = process.env.MONGO_URI?.replace(/\/[^/]+$/, '/attendance_test_db')
    || 'mongodb://localhost:27017/attendance_test_db';
