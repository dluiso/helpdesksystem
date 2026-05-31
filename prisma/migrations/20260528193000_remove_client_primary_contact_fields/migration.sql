ALTER TABLE "clients"
  DROP COLUMN IF EXISTS "primaryContactName",
  DROP COLUMN IF EXISTS "primaryContactEmail",
  DROP COLUMN IF EXISTS "primaryPhone";
