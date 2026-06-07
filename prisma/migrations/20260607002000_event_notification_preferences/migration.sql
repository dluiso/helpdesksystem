ALTER TABLE "user_notification_preferences"
  ADD COLUMN "inAppEventAssignedToMe" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppEventRequestUpdated" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppEventTaskAssignedToMe" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppEventTaskUpdated" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppEventCommentAdded" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailEventAssignedToMe" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailEventRequestUpdated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailEventTaskAssignedToMe" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailEventTaskUpdated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emailEventCommentAdded" BOOLEAN NOT NULL DEFAULT false;
