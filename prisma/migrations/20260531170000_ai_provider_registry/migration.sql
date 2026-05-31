ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'ANTHROPIC';
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'GEMINI';
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'AZURE_OPENAI';
ALTER TYPE "AiProvider" ADD VALUE IF NOT EXISTS 'CUSTOM_HTTP';

CREATE TABLE "ai_provider_configs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "baseUrl" TEXT,
  "apiKeyReference" TEXT,
  "defaultModel" TEXT,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
  "maxInputTokens" INTEGER,
  "maxOutputTokens" INTEGER,
  "supportsStreaming" BOOLEAN NOT NULL DEFAULT false,
  "supportsTools" BOOLEAN NOT NULL DEFAULT false,
  "supportsVision" BOOLEAN NOT NULL DEFAULT false,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_provider_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_model_configs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "providerConfigId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "displayName" TEXT,
  "maxInputTokens" INTEGER,
  "maxOutputTokens" INTEGER,
  "supportsVision" BOOLEAN NOT NULL DEFAULT false,
  "supportsTools" BOOLEAN NOT NULL DEFAULT false,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_action_settings" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "actionType" TEXT NOT NULL,
  "providerConfigId" UUID,
  "modelConfigId" UUID,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "systemPrompt" TEXT,
  "temperature" DOUBLE PRECISION,
  "maxOutputTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_action_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_configs_organizationId_name_key" ON "ai_provider_configs"("organizationId", "name");
CREATE INDEX "ai_provider_configs_organizationId_isEnabled_priority_idx" ON "ai_provider_configs"("organizationId", "isEnabled", "priority");
CREATE UNIQUE INDEX "ai_model_configs_providerConfigId_name_key" ON "ai_model_configs"("providerConfigId", "name");
CREATE INDEX "ai_model_configs_organizationId_isEnabled_idx" ON "ai_model_configs"("organizationId", "isEnabled");
CREATE UNIQUE INDEX "ai_action_settings_organizationId_actionType_key" ON "ai_action_settings"("organizationId", "actionType");
CREATE INDEX "ai_action_settings_organizationId_isEnabled_idx" ON "ai_action_settings"("organizationId", "isEnabled");

ALTER TABLE "ai_provider_configs" ADD CONSTRAINT "ai_provider_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ai_provider_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_action_settings" ADD CONSTRAINT "ai_action_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_action_settings" ADD CONSTRAINT "ai_action_settings_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ai_provider_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_action_settings" ADD CONSTRAINT "ai_action_settings_modelConfigId_fkey" FOREIGN KEY ("modelConfigId") REFERENCES "ai_model_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
