ALTER TABLE "system_settings"
  ADD COLUMN "emailOperationalHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailOperationalTimezone" TEXT NOT NULL DEFAULT 'America/Chicago',
  ADD COLUMN "emailOperationalDays" TEXT[] NOT NULL DEFAULT ARRAY['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']::TEXT[],
  ADD COLUMN "emailOperationalStartTime" TEXT NOT NULL DEFAULT '06:00',
  ADD COLUMN "emailOperationalEndTime" TEXT NOT NULL DEFAULT '17:00',
  ADD COLUMN "emailSkipUsFederalHolidays" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailCustomClosedDates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
