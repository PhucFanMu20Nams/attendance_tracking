import express from 'express';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import timesheetRoutes from './routes/timesheetRoutes.js';

const app = express();

// Enable CORS so frontend (different port/domain) can call this API
app.use(cors());
// Parse incoming JSON request body automatically
app.use(express.json());

// Health check endpoint - used to verify server is alive (useful for deployment/monitoring)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// === API Routes ===
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/timesheet', timesheetRoutes);

export default app;
