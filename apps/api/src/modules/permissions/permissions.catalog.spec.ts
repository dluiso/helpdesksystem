import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walkTypescriptFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return walkTypescriptFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

function extractSharedPermissions() {
  const sharedSource = readFileSync(join(process.cwd(), "../../packages/shared/src/index.ts"), "utf8");
  return new Set([...sharedSource.matchAll(/"([a-z0-9_]+\.[a-z0-9_]+)"/g)].map((match) => match[1]));
}

function extractRequiredPermissions() {
  const permissions = new Set<string>();
  for (const file of walkTypescriptFiles(join(process.cwd(), "src/modules"))) {
    if (!file.endsWith("controller.ts")) continue;
    const source = readFileSync(file, "utf8");
    for (const decorator of source.matchAll(/RequirePermissions\(([^)]*)\)/g)) {
      for (const permission of decorator[1].matchAll(/"([^"]+)"|'([^']+)'/g)) {
        permissions.add(permission[1] ?? permission[2]);
      }
    }
  }
  return permissions;
}

describe("permission catalog", () => {
  it("declares every permission required by API controllers", () => {
    const declaredPermissions = extractSharedPermissions();
    const requiredPermissions = extractRequiredPermissions();
    const missingPermissions = [...requiredPermissions].filter((permission) => !declaredPermissions.has(permission));

    expect(missingPermissions).toEqual([]);
  });
});
