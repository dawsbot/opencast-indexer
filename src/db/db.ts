import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HubTables } from '@farcaster/hub-shuttle';
import type { Fid } from '@farcaster/shuttle';
import {
  ColumnType,
  FileMigrationProvider,
  type Generated,
  GeneratedAlways,
  type Kysely,
  MigrationInfo,
  Migrator,
} from 'kysely';
import { type Result, err, ok } from 'neverthrow';
import type { Logger } from '../log';
import type { Tables } from './db.types';

const createMigrator = async (db: Kysely<HubTables>, log: Logger) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(currentDir, 'migrations'),
    }),
  });

  return migrator;
};

export const migrateToLatest = async (
  db: Kysely<HubTables>,
  log: Logger,
): Promise<Result<void, unknown>> => {
  const migrator = await createMigrator(db, log);

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      log.info(`Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      log.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    log.error('Failed to apply all database migrations');
    log.error(error);
    return err(error);
  }

  log.info('Migrations up to date');
  return ok(undefined);
};

export type AppDb = Kysely<Tables>;
