import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { createOriginProtectionMiddleware } from "./common/origin-protection.middleware";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  const config = app.get(ConfigService);
  const appUrl = config.get<string>("APP_URL") ?? "http://localhost:3000";
  const allowedOrigins = (config.get<string>("CORS_ORIGINS") ?? appUrl)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if ((config.get<string>("APP_ENV") ?? "development") === "production") {
    const sessionSecret = config.get<string>("SESSION_SECRET") ?? "";
    if (sessionSecret.length < 32 || sessionSecret === "change-me-to-a-long-random-value") {
      throw new Error("SESSION_SECRET must be set to a strong random value in production.");
    }
  }

  app.setGlobalPrefix("api");
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(helmet());
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser(config.get<string>("SESSION_SECRET")));
  app.use(createOriginProtectionMiddleware(config));
  app.enableCors({
    origin: allowedOrigins,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = Number(config.get<string>("PORT") ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
