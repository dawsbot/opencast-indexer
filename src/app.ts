import { Command } from '@commander-js/extra-typings';
import {
  bytesToHexString,
  type HubEvent,
  type Message,
} from '@farcaster/hub-nodejs';
import {
  EventStreamConnection,
  EventStreamHubSubscriber,
  HubEventProcessor,
  HubEventStreamConsumer,
  MessageReconciliation,
  RedisClient,
  getDbClient,
  getHubClient,
  type DB,
  type HubSubscriber,
  type MessageHandler,
  type MessageState,
  type StoreMessageOperation,
} from '@farcaster/shuttle'; // If you want to use this as a standalone app, replace this import with ""
import type { Queue } from 'bullmq';
import { ok } from 'neverthrow';
import { readFileSync } from 'node:fs';
import * as process from 'node:process';
import url from 'node:url';
import { MessageWriter } from './Message';
import { migrateToLatest, type AppDb } from './db/db';
import {
  BACKFILL_FIDS,
  CONCURRENCY,
  HUB_HOST,
  HUB_SSL,
  MAX_FID,
  POSTGRES_URL,
  REDIS_URL,
  SHARD_INDEX,
  TOTAL_SHARDS,
} from './env';
import { jobNames } from './jobs';
import { log } from './log';
import { getQueue, getWorker } from './worker';

const hubId = 'shuttle';

export class App implements MessageHandler {
  private readonly db: DB;
  private hubSubscriber: HubSubscriber;
  private streamConsumer: HubEventStreamConsumer;
  public redis: RedisClient;
  private readonly hubId;

  constructor(
    db: DB,
    redis: RedisClient,
    hubSubscriber: HubSubscriber,
    streamConsumer: HubEventStreamConsumer,
  ) {
    this.db = db;
    this.redis = redis;
    this.hubSubscriber = hubSubscriber;
    this.hubId = hubId;
    this.streamConsumer = streamConsumer;
  }

  static create(
    dbUrl: string,
    redisUrl: string,
    hubUrl: string,
    totalShards: number,
    shardIndex: number,
    hubSSL = false,
  ) {
    const db = getDbClient(dbUrl);
    const hub = getHubClient(hubUrl, { ssl: hubSSL });
    const redis = RedisClient.create(redisUrl);
    const eventStreamForWrite = new EventStreamConnection(redis.client);
    const eventStreamForRead = new EventStreamConnection(redis.client);
    const shardKey = totalShards === 0 ? 'all' : `${shardIndex}`;
    const hubSubscriber = new EventStreamHubSubscriber(
      hubId,
      hub,
      eventStreamForWrite,
      redis,
      shardKey,
      log,
      undefined,
      totalShards,
      shardIndex,
    );
    const streamConsumer = new HubEventStreamConsumer(
      hub,
      eventStreamForRead,
      shardKey,
    );

    return new App(db, redis, hubSubscriber, streamConsumer);
  }

  async handleMessageMerge(
    message: Message,
    txn: DB,
    operation: StoreMessageOperation,
    state: MessageState,
    isNew: boolean,
    wasMissed: boolean,
  ): Promise<void> {
    if (!isNew) {
      // Message was already in the db, no-op
      return;
    }

    const appDB = txn as unknown as AppDb; // Need this to make typescript happy, not clean way to "inherit" table types

    const messageWriter = new MessageWriter(appDB);
    // Example of how to materialize casts into a separate table. Insert casts into a separate table, and mark them as deleted when removed
    // Note that since we're relying on "state", this can sometimes be invoked twice. e.g. when a CastRemove is merged, this call will be invoked 2 twice:
    // castAdd, operation=delete, state=deleted (the cast that the remove is removing)
    // castRemove, operation=merge, state=deleted (the actual remove message)
    // const isCastMessage =
    //   isCastAddMessage(message) || isCastRemoveMessage(message);
    await messageWriter.writeMessage(message, state);

    const messageDesc = wasMissed
      ? `missed message (${operation})`
      : `message (${operation})`;
    log.info(
      `${state} ${messageDesc} ${bytesToHexString(
        message.hash,
      )._unsafeUnwrap()} (type ${message.data?.type})`,
    );
  }

  async start() {
    await this.ensureMigrations();
    // Hub subscriber listens to events from the hub and writes them to a redis stream. This allows for scaling by
    // splitting events to multiple streams
    await this.hubSubscriber.start();

    // Sleep 10 seconds to give the subscriber a chance to create the stream for the first time.
    await new Promise((resolve) => setTimeout(resolve, 10_000));

    log.info('Starting stream consumer');
    // Stream consumer reads from the redis stream and inserts them into postgres
    await this.streamConsumer.start(async (event) => {
      void this.processHubEvent(event);
      return ok({ skipped: false });
    });
  }

  async reconcileFids(fids: number[]) {
    const reconciler = new MessageReconciliation(
      this.hubSubscriber.hubClient!,
      this.db,
      log,
    );
    for (const fid of fids) {
      await reconciler.reconcileMessagesForFid(
        fid,
        async (message, missingInDb, prunedInDb, revokedInDb) => {
          if (missingInDb) {
            await HubEventProcessor.handleMissingMessage(
              this.db,
              message,
              this,
            );
          } else if (prunedInDb || revokedInDb) {
            const messageDesc = prunedInDb
              ? 'pruned'
              : revokedInDb
                ? 'revoked'
                : 'existing';
            log.info(
              `Reconciled ${messageDesc} message ${bytesToHexString(
                message.hash,
              )._unsafeUnwrap()}`,
            );
          }
        },
      );
    }
  }

  async backfillFids(fids: number[], backfillQueue: Queue) {
    const startedAt = Date.now();
    if (fids.length === 0) {
      const maxFidResult = await this.hubSubscriber.hubClient!.getFids({
        pageSize: 1,
        reverse: true,
      });
      if (maxFidResult.isErr()) {
        log.error('Failed to get max fid', maxFidResult.error);
        throw maxFidResult.error;
      }
      const maxFid = MAX_FID
        ? Number.parseInt(MAX_FID)
        : maxFidResult.value.fids[0];
      if (!maxFid) {
        log.error('Max fid was undefined');
        throw new Error('Max fid was undefined');
      }
      log.info(`Queuing up fids upto: ${maxFid}`);
      // create an array of arrays in batches of 100 upto maxFid
      const batchSize = 10;
      const fids = Array.from(
        { length: Math.ceil(maxFid / batchSize) },
        (_, i) => i * batchSize,
      ).map((fid) => fid + 1);
      for (const start of fids) {
        const subset = Array.from({ length: batchSize }, (_, i) => start + i);
        await backfillQueue.add(jobNames.reconcile, { fids: subset });
      }
    } else {
      await backfillQueue.add(jobNames.reconcile, { fids });
    }
    await backfillQueue.add(jobNames.completionMarker, { startedAt });
    log.info('Backfill jobs queued');
  }

  private async processHubEvent(hubEvent: HubEvent) {
    await HubEventProcessor.processHubEvent(this.db, hubEvent, this);
  }

  async ensureMigrations() {
    const result = await migrateToLatest(this.db, log);
    if (result.isErr()) {
      log.error('Failed to migrate database', result.error);
      throw result.error;
    }
  }

  async stop() {
    this.hubSubscriber.stop();
    const lastEventId = await this.redis.getLastProcessedEvent(this.hubId);
    log.info(`Stopped at eventId: ${lastEventId}`);
  }
}

//If the module is being run directly, start the shuttle
if (
  import.meta.url.endsWith(url.pathToFileURL(process.argv[1] || '').toString())
) {
  async function start() {
    log.info(
      `Creating app connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST}`,
    );
    const app = App.create(
      POSTGRES_URL,
      REDIS_URL,
      HUB_HOST,
      TOTAL_SHARDS,
      SHARD_INDEX,
      HUB_SSL,
    );
    log.info('Starting shuttle');
    await app.start();
  }

  async function backfill() {
    log.info(
      `Creating app connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST}`,
    );
    const app = App.create(
      POSTGRES_URL,
      REDIS_URL,
      HUB_HOST,
      TOTAL_SHARDS,
      SHARD_INDEX,
      HUB_SSL,
    );
    const fids = BACKFILL_FIDS
      ? BACKFILL_FIDS.split(',').map((fid) => Number.parseInt(fid))
      : [];
    log.info(`Backfilling fids: ${fids}`);
    const backfillQueue = getQueue(app.redis.client);
    await app.backfillFids(fids, backfillQueue);

    // Start the worker after initiating a backfill
    const worker = getWorker(app, app.redis.client, log, CONCURRENCY);
    await worker.run();
    return;
  }

  async function worker() {
    log.info(
      `Starting worker connecting to: ${POSTGRES_URL}, ${REDIS_URL}, ${HUB_HOST}`,
    );
    const app = App.create(
      POSTGRES_URL,
      REDIS_URL,
      HUB_HOST,
      TOTAL_SHARDS,
      SHARD_INDEX,
      HUB_SSL,
    );
    const worker = getWorker(app, app.redis.client, log, CONCURRENCY);
    await worker.run();
  }

  // for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  //   process.on(signal, async () => {
  //     log.info(`Received ${signal}. Shutting down...`);
  //     (async () => {
  //       await sleep(10_000);
  //       log.info(`Shutdown took longer than 10s to complete. Forcibly terminating.`);
  //       process.exit(1);
  //     })();
  //     await app?.stop();
  //     process.exit(1);
  //   });
  // }

  const program = new Command()
    .name('shuttle')
    .description('Synchronizes a Farcaster Hub with a Postgres database')
    .version(JSON.parse(readFileSync('./package.json').toString()).version);

  program.command('start').description('Starts the shuttle').action(start);
  program
    .command('backfill')
    .description('Queue up backfill for the worker')
    .action(backfill);
  program
    .command('worker')
    .description('Starts the backfill worker')
    .action(worker);

  program.parse(process.argv);
}
