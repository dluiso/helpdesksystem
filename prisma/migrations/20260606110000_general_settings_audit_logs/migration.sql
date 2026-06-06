ALTER TABLE "system_settings"
ADD COLUMN "loginLogoUrl" TEXT,
ADD COLUMN "appIconUrl" TEXT,
ADD COLUMN "loginHeadline" TEXT,
ADD COLUMN "loginSubtitle" TEXT,
ADD COLUMN "loginFooterText" TEXT,
ADD COLUMN "supportButtonEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "supportButtonLabel" TEXT NOT NULL DEFAULT 'Support',
ADD COLUMN "supportButtonUrl" TEXT,
ADD COLUMN "defaultLandingPage" TEXT NOT NULL DEFAULT '/dashboard',
ADD COLUMN "dateFormat" TEXT NOT NULL DEFAULT 'MMM dd, yyyy',
ADD COLUMN "timeFormat" TEXT NOT NULL DEFAULT '12h';

INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (md5('permission:system_settings.update')::uuid, 'system_settings.update', 'Allows updating general system settings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:audit_logs.view')::uuid, 'audit_logs.view', 'Allows viewing application event logs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:audit_logs.export')::uuid, 'audit_logs.export', 'Allows exporting application event logs', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Admin')
  AND p."name" IN ('system_settings.view', 'system_settings.update', 'audit_logs.view', 'audit_logs.export')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
