import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { apiRouter } from './routes/index.js';

const app = express();

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

app.get('/', (_request, response) => {
  response.json({
    ok: true,
    message: `${env.appName} is running`
  });
});

app.use('/api', apiRouter);

app.use((request, response) => {
  response.status(404).json({
    ok: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
});

app.use((error, _request, response, _next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    response.status(400).json({
      ok: false,
      message: 'La imagen no debe superar 5 MB'
    });
    return;
  }

  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    ok: false,
    message: error.message || 'Internal server error'
  });
});

export { app };
