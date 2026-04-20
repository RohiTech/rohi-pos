-- Translate existing membership plans to Spanish while preserving references.
-- Safe to run multiple times.

DO $$
DECLARE
    old_id BIGINT;
    new_id BIGINT;
BEGIN
    -- Weekly -> Semanal
    SELECT id INTO old_id FROM membership_plans WHERE lower(name) = lower('Weekly') LIMIT 1;
    SELECT id INTO new_id FROM membership_plans WHERE lower(name) = lower('Semanal') LIMIT 1;

    IF old_id IS NOT NULL THEN
        IF new_id IS NOT NULL AND new_id <> old_id THEN
            UPDATE memberships SET plan_id = new_id WHERE plan_id = old_id;
            DELETE FROM membership_plans WHERE id = old_id;
        ELSE
            UPDATE membership_plans
            SET name = 'Semanal'
            WHERE id = old_id;
            new_id := old_id;
        END IF;
    END IF;

    UPDATE membership_plans
    SET description = 'Plan de acceso de 7 dias', duration_days = 7
    WHERE lower(name) = lower('Semanal');

    -- Monthly -> Mensual
    old_id := NULL;
    new_id := NULL;
    SELECT id INTO old_id FROM membership_plans WHERE lower(name) = lower('Monthly') LIMIT 1;
    SELECT id INTO new_id FROM membership_plans WHERE lower(name) = lower('Mensual') LIMIT 1;

    IF old_id IS NOT NULL THEN
        IF new_id IS NOT NULL AND new_id <> old_id THEN
            UPDATE memberships SET plan_id = new_id WHERE plan_id = old_id;
            DELETE FROM membership_plans WHERE id = old_id;
        ELSE
            UPDATE membership_plans
            SET name = 'Mensual'
            WHERE id = old_id;
            new_id := old_id;
        END IF;
    END IF;

    UPDATE membership_plans
    SET description = 'Plan de acceso de 30 dias', duration_days = 30
    WHERE lower(name) = lower('Mensual');

    -- Quarterly -> Trimestral
    old_id := NULL;
    new_id := NULL;
    SELECT id INTO old_id FROM membership_plans WHERE lower(name) = lower('Quarterly') LIMIT 1;
    SELECT id INTO new_id FROM membership_plans WHERE lower(name) = lower('Trimestral') LIMIT 1;

    IF old_id IS NOT NULL THEN
        IF new_id IS NOT NULL AND new_id <> old_id THEN
            UPDATE memberships SET plan_id = new_id WHERE plan_id = old_id;
            DELETE FROM membership_plans WHERE id = old_id;
        ELSE
            UPDATE membership_plans
            SET name = 'Trimestral'
            WHERE id = old_id;
            new_id := old_id;
        END IF;
    END IF;

    UPDATE membership_plans
    SET description = 'Plan de acceso de 90 dias', duration_days = 90
    WHERE lower(name) = lower('Trimestral');

    -- Annual Plus -> Anual Plus
    old_id := NULL;
    new_id := NULL;
    SELECT id INTO old_id FROM membership_plans WHERE lower(name) = lower('Annual Plus') LIMIT 1;
    SELECT id INTO new_id FROM membership_plans WHERE lower(name) = lower('Anual Plus') LIMIT 1;

    IF old_id IS NOT NULL THEN
        IF new_id IS NOT NULL AND new_id <> old_id THEN
            UPDATE memberships SET plan_id = new_id WHERE plan_id = old_id;
            DELETE FROM membership_plans WHERE id = old_id;
        ELSE
            UPDATE membership_plans
            SET name = 'Anual Plus'
            WHERE id = old_id;
            new_id := old_id;
        END IF;
    END IF;

    UPDATE membership_plans
    SET description = 'Plan premium anual', duration_days = 365
    WHERE lower(name) = lower('Anual Plus');
END $$;
