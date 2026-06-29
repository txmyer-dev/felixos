import { sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Options, Sql } from "postgres";

import { requireTenantId } from "./context.js";
import { currentTenantSetting } from "./rls.js";
import * as schema from "./schema/index.js";

export type DatabaseSql = Sql;

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
export type ScopedTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export type ScopedDatabaseClient = {
  db: DatabaseClient;
  sql: DatabaseSql;
  transaction<T>(callback: (tx: ScopedTransaction) => Promise<T>): Promise<T>;
  end(): Promise<void>;
};

export type PrivilegedDatabaseClient = {
  db: DatabaseClient;
  sql: DatabaseSql;
  end(): Promise<void>;
};

export function createSqlClient(databaseUrl: string, options: Options<Record<string, never>> = {}) {
  return postgres(databaseUrl, options);
}

export function createDatabaseClient(sqlClient: DatabaseSql) {
  return drizzle(sqlClient, { schema });
}

export function createScopedDatabaseClient(
  databaseUrl: string,
  options: Options<Record<string, never>> = {}
): ScopedDatabaseClient {
  const sqlClient = createSqlClient(databaseUrl, options);
  const db = createDatabaseClient(sqlClient);

  return {
    db,
    sql: sqlClient,
    async transaction<T>(callback: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
      const tenantId = requireTenantId();

      return db.transaction(async (tx) => {
        await tx.execute(drizzleSql`select set_config(${currentTenantSetting}, ${tenantId}, true)`);

        return callback(tx);
      });
    },
    async end(): Promise<void> {
      await sqlClient.end({ timeout: 5 });
    }
  };
}

export function createPrivilegedDatabaseClient(
  databaseUrl: string,
  options: Options<Record<string, never>> = {}
): PrivilegedDatabaseClient {
  const sqlClient = createSqlClient(databaseUrl, options);
  const db = createDatabaseClient(sqlClient);

  return {
    db,
    sql: sqlClient,
    async end(): Promise<void> {
      await sqlClient.end({ timeout: 5 });
    }
  };
}
