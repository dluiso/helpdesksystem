INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'external_specialists.view', 'Allows external specialists view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'external_specialists.manage', 'Allows external specialists manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Admin', 'Manager', 'Technician')
  AND p."name" IN ('external_specialists.view', 'external_specialists.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
