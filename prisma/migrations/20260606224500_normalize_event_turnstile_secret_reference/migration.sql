UPDATE "system_settings"
SET "eventTurnstileSecretReference" = 'env:EVENT_TURNSTILE_SECRET_KEY'
WHERE "eventTurnstileEnabled" = true
  AND (
    "eventTurnstileSecretReference" IS NULL
    OR "eventTurnstileSecretReference" = ''
    OR "eventTurnstileSecretReference" NOT LIKE 'env:%'
  );
