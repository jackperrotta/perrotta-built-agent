import express from 'express';
import cors from 'cors';
import { type ScanSession } from '@construction/shared';

const app = express();
const port = Number(process.env.PORT) || 8080;

app.use(cors());
app.use(express.json());

import sessionsRouter from './routes/sessions.js';
import uploadRouter from './routes/upload.js';
import docsRouter from './routes/docs.js';

app.use('/api/docs', docsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/upload', uploadRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend server listening on port ${port}`);
});
