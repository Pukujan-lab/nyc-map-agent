-- Deterministic text snapshot of every user object, for the migration
-- round-trip check (.github/workflows/migrations.yml). Excludes system schemas.
WITH ns AS (
  SELECT oid, nspname FROM pg_namespace
  WHERE nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND nspname NOT LIKE 'pg_temp%' AND nspname NOT LIKE 'pg_toast_temp%'
)
SELECT line FROM (
  SELECT 'schema ' || nspname AS line FROM ns
  UNION ALL
  SELECT format('rel %s.%s kind=%s', ns.nspname, c.relname, c.relkind)
  FROM pg_class c JOIN ns ON ns.oid = c.relnamespace WHERE c.relkind IN ('r','v','m','S','p','f')
  UNION ALL
  SELECT format('col %s.%s.%s %s null=%s default=%s', ns.nspname, c.relname, a.attname,
                format_type(a.atttypid, a.atttypmod), NOT a.attnotnull, pg_get_expr(d.adbin, d.adrelid))
  FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN ns ON ns.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','v','m','p','f')
  UNION ALL
  SELECT format('index %s %s', ns.nspname, pg_get_indexdef(i.indexrelid))
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN ns ON ns.oid = c.relnamespace
  UNION ALL
  SELECT format('constraint %s.%s %s %s', ns.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid))
  FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN ns ON ns.oid = c.relnamespace
  UNION ALL
  SELECT format('view %s.%s %s', ns.nspname, c.relname, regexp_replace(pg_get_viewdef(c.oid, true), '\s+', ' ', 'g'))
  FROM pg_class c JOIN ns ON ns.oid = c.relnamespace WHERE c.relkind IN ('v','m')
  UNION ALL
  SELECT format('function %s.%s(%s) %s', ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid), md5(p.prosrc))
  FROM pg_proc p JOIN ns ON ns.oid = p.pronamespace
  UNION ALL
  SELECT format('trigger %s.%s %s', ns.nspname, c.relname, pg_get_triggerdef(t.oid))
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN ns ON ns.oid = c.relnamespace WHERE NOT t.tgisinternal
) s ORDER BY line;
