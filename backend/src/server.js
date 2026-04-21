import { app } from './app.js';
import { env } from './config/env.js';
import { checkDatabaseConnection, pool } from './config/db.js';
import { startMembershipStatusScheduler } from './jobs/membership-status.job.js';

async function startServer() {
  try {
    const databaseInfo = await checkDatabaseConnection();
    startMembershipStatusScheduler();

    app.listen(env.port, () => {
      console.log(`${env.appName} listening on port ${env.port}`);
      console.log(
        `Connected to PostgreSQL database "${databaseInfo.database_name}" as "${databaseInfo.database_user}"`
      );
    });
  } catch (error) {
    console.error('Failed to start RohiPOS backend');
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

startServer();
