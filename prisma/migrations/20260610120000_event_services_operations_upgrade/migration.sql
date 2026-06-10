CREATE TYPE "AutoReplyTemplateType" AS ENUM ('TICKET', 'EVENT_SERVICE');

CREATE TYPE "AutoReplyTrigger" AS ENUM ('TICKET_CREATED', 'EVENT_REQUEST_CREATED', 'EVENT_STATUS_CHANGED');

ALTER TABLE "system_settings"
  ADD COLUMN "eventCalendarSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eventCalendarTenantId" TEXT,
  ADD COLUMN "eventCalendarClientId" TEXT,
  ADD COLUMN "eventCalendarClientSecretReference" TEXT,
  ADD COLUMN "eventCalendarDefaultTimeZone" TEXT NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE "auto_reply_templates"
  ADD COLUMN "templateType" "AutoReplyTemplateType" NOT NULL DEFAULT 'TICKET',
  ADD COLUMN "trigger" "AutoReplyTrigger" NOT NULL DEFAULT 'TICKET_CREATED';

ALTER TABLE "auto_reply_histories"
  ADD COLUMN "eventServiceRequestId" UUID;

ALTER TABLE "event_service_tasks"
  ADD COLUMN "calendarEventId" TEXT,
  ADD COLUMN "calendarUserEmail" TEXT,
  ADD COLUMN "calendarSyncedAt" TIMESTAMP(3),
  ADD COLUMN "calendarSyncError" TEXT;

ALTER TABLE "user_notification_preferences"
  ADD COLUMN "inAppNewEventRequestCreated" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailNewEventRequestCreated" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "event_service_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "authorUserId" UUID,
  "direction" "MessageDirection" NOT NULL,
  "visibility" "MessageVisibility" NOT NULL DEFAULT 'PUBLIC',
  "bodyText" TEXT NOT NULL,
  "bodyHtml" TEXT,
  "sanitizedBodyHtml" TEXT,
  "senderEmail" TEXT,
  "emailMessageId" TEXT,
  "emailInternetMessageId" TEXT,
  "emailConversationId" TEXT,
  "inReplyTo" TEXT,
  "emailReferences" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_service_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auto_reply_templates_organizationId_templateType_trigger_idx" ON "auto_reply_templates"("organizationId", "templateType", "trigger");
CREATE INDEX "auto_reply_histories_eventServiceRequestId_idx" ON "auto_reply_histories"("eventServiceRequestId");
CREATE INDEX "event_service_messages_requestId_createdAt_idx" ON "event_service_messages"("requestId", "createdAt");
CREATE INDEX "event_service_messages_authorUserId_idx" ON "event_service_messages"("authorUserId");
CREATE INDEX "event_service_messages_emailConversationId_idx" ON "event_service_messages"("emailConversationId");

ALTER TABLE "event_service_messages" ADD CONSTRAINT "event_service_messages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_messages" ADD CONSTRAINT "event_service_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
