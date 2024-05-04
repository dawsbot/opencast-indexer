import {
  LinkAddMessage,
  LinkRemoveMessage,
  fromFarcasterTime,
} from '@farcaster/core';
import type { Insertable } from 'kysely';
import { log } from '../../log';
import { farcasterTimeToDate } from '../../utils';
import type { AppDb } from '../db';
import type { Tables } from '../db.types';

export class Links {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  private formatLinkAddMessage(message: LinkAddMessage) {
    const data = message.data!;
    const link = data.linkBody!;
    const timestamp = fromFarcasterTime(data.timestamp)._unsafeUnwrap();

    return {
      timestamp: new Date(timestamp),
      fid: data.fid,
      targetFid: link.targetFid,
      displayTimestamp: link.displayTimestamp
        ? new Date(fromFarcasterTime(link.displayTimestamp)._unsafeUnwrap())
        : null,
      type: link.type,
      hash: message.hash,
    } satisfies unknown as Insertable<Tables['links']>;
  }
  public async insertOne(message: LinkAddMessage) {
    const link = this.formatLinkAddMessage(message);

    await this.appDb
      .insertInto('links')
      .values(link)
      .onConflict((oc) => oc.column('hash').doNothing())
      .execute();
  }
  public async deleteOne(message: LinkRemoveMessage) {
    await this.appDb
      .updateTable('links')
      .set({
        deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date(),
      })
      .where('hash', '=', message.hash)
      .execute();
    log.trace('Deleted link', message.hash);
  }
}
