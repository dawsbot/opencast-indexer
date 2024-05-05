import {
  CastRemoveMessage,
  fromFarcasterTime,
  type CastAddMessage,
} from '@farcaster/hub-nodejs';
import type { Insertable } from 'kysely';
import { log } from '../../log';
import { farcasterTimeToDate } from '../../utils';
import type { AppDb } from '../db';
import type { Tables } from '../db.types';

export class Casts {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  private formatCastAddMessage(message: CastAddMessage) {
    const data = message.data;
    const castAddBody = data.castAddBody;
    const timestamp = fromFarcasterTime(data.timestamp)._unsafeUnwrap();

    return {
      timestamp: new Date(timestamp),
      fid: data.fid,
      parentFid: castAddBody.parentCastId?.fid,
      hash: message.hash,
      parentHash: castAddBody.parentCastId?.hash,
      parentUrl: castAddBody.parentUrl,
      text: castAddBody.text,
      embeds: JSON.stringify(castAddBody.embeds),
      mentions: JSON.stringify(castAddBody.mentions),
      mentionsPositions: JSON.stringify(castAddBody.mentionsPositions),
    } satisfies unknown as Insertable<Tables['casts']>;
  }
  public async insertOne(message: CastAddMessage) {
    const cast = this.formatCastAddMessage(message);

    await this.appDb.insertInto('casts').values(cast).execute();
  }
  public async deleteOne(message: CastRemoveMessage) {
    await this.appDb
      .updateTable('casts')
      .set({
        deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date(),
      })
      .where('hash', '=', message.hash)
      .execute();
    log.trace('Deleted cast', message.hash);
  }
}
