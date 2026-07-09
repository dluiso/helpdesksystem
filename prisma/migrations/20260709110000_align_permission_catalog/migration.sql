INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (md5('permission:audit_logs.export')::uuid, 'audit_logs.export', 'Allows exporting application event logs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Admin')
  AND p."name" = 'audit_logs.export'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
