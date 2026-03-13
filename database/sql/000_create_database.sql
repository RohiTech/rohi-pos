-- Run this script with a superuser or a user with CREATE DATABASE privileges.
-- Execute it before 001_schema.sql.

CREATE DATABASE rohipos
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    TEMPLATE = template0;
