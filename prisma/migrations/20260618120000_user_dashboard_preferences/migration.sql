CREATE TABLE "user_dashboard_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "layout" JSONB NOT NULL,
    "hiddenWidgets" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_dashboard_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_dashboard_preferences_userId_key" ON "user_dashboard_preferences"("userId");

ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
