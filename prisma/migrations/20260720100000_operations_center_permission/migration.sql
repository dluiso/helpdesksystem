INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES (md5('permission:operations.view')::uuid, 'operations.view', 'Allows access to the Operations Center', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "description" = EXCLUDED."description",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."name" = 'operations.view'
WHERE r."name" IN ('Super Admin', 'Admin', 'Manager', 'Technician')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
