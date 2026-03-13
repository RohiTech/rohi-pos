import { Router } from 'express';
import { checkDatabaseConnection } from '../config/db.js';

const healthRouter = Router();

healthRouter.get('/', async (_request, response, next) => {
  try {
    const database = await checkDatabaseConnection();

    response.json({
      ok: true,
      service: 'rohipos-backend',
      database
    });
  } catch (error) {
    next(error);
  }
});

export { healthRouter };
