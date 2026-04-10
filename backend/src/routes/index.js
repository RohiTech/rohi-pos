import { Router } from 'express';
import { authenticateRequest } from '../middleware/auth.middleware.js';
import { authRouter } from './auth.routes.js';
import { attendanceRouter } from './attendance.routes.js';
import { clientsRouter } from './clients.routes.js';
import { healthRouter } from './health.routes.js';
import { membershipPlansRouter } from './membership-plans.routes.js';
import { membershipsRouter } from './memberships.routes.js';
import { productCategoriesRouter } from './product-categories.routes.js';
import { productsRouter } from './products.routes.js';
import { rolesRouter } from './roles.routes.js';
import { salesRouter } from './sales.routes.js';
import { settingsRouter } from './settings.routes.js';
import { usersRouter } from './users.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use(authenticateRequest);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/clients', clientsRouter);
apiRouter.use('/membership-plans', membershipPlansRouter);
apiRouter.use('/memberships', membershipsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/product-categories', productCategoriesRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/sales', salesRouter);
apiRouter.use('/users', usersRouter);

export { apiRouter };
