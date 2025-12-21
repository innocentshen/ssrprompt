import 'dotenv/config';
import express from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { authenticateApiKey } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import mysqlProxyRouter from './routes/mysql-proxy.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api', authenticateApiKey, mysqlProxyRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 MySQL Proxy Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API Key authentication: ${process.env.API_KEY ? 'enabled' : 'disabled (WARNING)'}`);
});
