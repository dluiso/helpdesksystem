export interface RuntimeConfig {
  appName: string;
  appEnv: string;
  appUrl: string;
  apiUrl: string;
  databaseUrl: string;
  redisUrl: string;
  fileStorageProvider: "local" | "s3" | "minio" | "azure_blob";
  localStoragePath: string;
  maxUploadSizeMb: number;
}

export const defaultRuntimeConfig: RuntimeConfig = {
  appName: "Avidity IT Management Tool",
  appEnv: "development",
  appUrl: "http://localhost:3000",
  apiUrl: "http://localhost:4000",
  databaseUrl: "postgresql://postgres:postgres@localhost:5432/avidity_it_management",
  redisUrl: "redis://localhost:6379",
  fileStorageProvider: "local",
  localStoragePath: "./storage/local",
  maxUploadSizeMb: 25
};
