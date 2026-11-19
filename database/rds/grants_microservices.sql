\set ON_ERROR_STOP on

-- Permisos sobre la base de datos
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT CONNECT ON DATABASE :"db_name" TO :"ingest_user";

-- Permisos sobre schema_auth
GRANT USAGE ON SCHEMA schema_auth TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_auth TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA schema_auth TO :"app_user";

GRANT USAGE ON SCHEMA schema_auth TO :"ingest_user";
GRANT SELECT ON ALL TABLES IN SCHEMA schema_auth TO :"ingest_user";

-- Permisos sobre schema_catalog
GRANT USAGE ON SCHEMA schema_catalog TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_catalog TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA schema_catalog TO :"app_user";

GRANT USAGE ON SCHEMA schema_catalog TO :"ingest_user";
GRANT SELECT ON ALL TABLES IN SCHEMA schema_catalog TO :"ingest_user";

-- Permisos sobre schema_orders
GRANT USAGE ON SCHEMA schema_orders TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA schema_orders TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA schema_orders TO :"app_user";

GRANT USAGE ON SCHEMA schema_orders TO :"ingest_user";
GRANT SELECT ON ALL TABLES IN SCHEMA schema_orders TO :"ingest_user";

-- Default privileges para futuras tablas
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_catalog GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_orders GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";

ALTER DEFAULT PRIVILEGES IN SCHEMA schema_auth GRANT SELECT ON TABLES TO :"ingest_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_catalog GRANT SELECT ON TABLES TO :"ingest_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA schema_orders GRANT SELECT ON TABLES TO :"ingest_user";
