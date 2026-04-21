import { query } from '../config/db.js';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function getNextRunAt(reference = new Date()) {
  const nextRunAt = new Date(reference);
  nextRunAt.setHours(0, 1, 0, 0);

  if (nextRunAt <= reference) {
    nextRunAt.setDate(nextRunAt.getDate() + 1);
  }

  return nextRunAt;
}

export async function refreshMembershipStatuses() {
  const result = await query(
    `UPDATE memberships
     SET status = CASE
       WHEN end_date < CURRENT_DATE THEN 'expired'
       WHEN start_date > CURRENT_DATE THEN 'pending'
       ELSE 'active'
     END,
     updated_at = NOW()
     WHERE status <> 'cancelled'
       AND status IS DISTINCT FROM CASE
         WHEN end_date < CURRENT_DATE THEN 'expired'
         WHEN start_date > CURRENT_DATE THEN 'pending'
         ELSE 'active'
       END`
  );

  return result.rowCount || 0;
}

export function startMembershipStatusScheduler() {
  let timeoutId = null;

  const scheduleNextExecution = () => {
    const now = new Date();
    const nextRunAt = getNextRunAt(now);
    const delay = Math.max(nextRunAt.getTime() - now.getTime(), 0);

    timeoutId = setTimeout(async () => {
      try {
        const updatedRows = await refreshMembershipStatuses();
        console.log(`[MembershipScheduler] Estado actualizado. Registros afectados: ${updatedRows}`);
      } catch (error) {
        console.error('[MembershipScheduler] Error actualizando estados de membresia:', error);
      } finally {
        scheduleNextExecution();
      }
    }, delay);

    console.log(
      `[MembershipScheduler] Proxima ejecucion programada para: ${nextRunAt.toLocaleString('es-NI')}`
    );
  };

  scheduleNextExecution();

  // Keep the scheduler aligned with 00:01 while preventing stale data after restarts.
  refreshMembershipStatuses()
    .then((updatedRows) => {
      console.log(`[MembershipScheduler] Verificacion inicial completada. Registros afectados: ${updatedRows}`);
    })
    .catch((error) => {
      console.error('[MembershipScheduler] Error en verificacion inicial de membresias:', error);
    });

  return {
    stop() {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

export { getNextRunAt, ONE_DAY_IN_MS };
