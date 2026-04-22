require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const oracleRoutes = require('./routes/oracle');
const ttsRoutes = require('./routes/tts');

const app = express();
const PORT = process.env.PORT || 3001;

// Allow requests from the Vite dev server; adjust for production
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
}));

app.use(express.json());
app.use('/api', oracleRoutes);
app.use('/api', ttsRoutes);

// Generic error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`Oracle backend running on http://localhost:${PORT}`);
});
