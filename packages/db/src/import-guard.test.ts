import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const apiGuardedDirs = ["../../../apps/api/src/routes", "../../../apps/api/src/middleware"];
const forbiddenPatterns = [/createPrivilegedDatabaseClient/, /felixos_privileged_role/];

async function findTypeScriptFiles(directory: string): Promise<string[]> {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return findTypeScriptFiles(path);
      }

      return entry.isFile() && path.endsWith(".ts") ? [path] : [];
    })
  );

  return files.flat();
}

describe("privileged client import guard", () => {
  test("keeps privileged database access out of API routes and middleware", async () => {
    const guardedFiles = (
      await Promise.all(
        apiGuardedDirs.map((relativeDir) =>
          findTypeScriptFiles(new URL(relativeDir, import.meta.url).pathname)
        )
      )
    ).flat();

    const violations: string[] = [];

    for (const file of guardedFiles) {
      const source = await readFile(file, "utf8");

      if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});
