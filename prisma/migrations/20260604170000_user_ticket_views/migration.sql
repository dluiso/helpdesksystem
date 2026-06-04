CREATE TABLE "user_ticket_views" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ticket_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_ticket_views_userId_name_key" ON "user_ticket_views"("userId", "name");
CREATE INDEX "user_ticket_views_userId_isDefault_idx" ON "user_ticket_views"("userId", "isDefault");

ALTER TABLE "user_ticket_views"
ADD CONSTRAINT "user_ticket_views_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
