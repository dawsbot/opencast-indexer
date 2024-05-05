import {
  ReactionAddMessage,
  ReactionRemoveMessage,
  fromFarcasterTime,
} from '@farcaster/core';
import type { Insertable } from 'kysely';
import { log } from '../../log';
import { farcasterTimeToDate } from '../../utils';
import type { AppDb } from '../db';
import type { Tables } from '../db.types';

export class Reactions {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  private formatReactionAddMessage(message: ReactionAddMessage) {
    const data = message.data!;
    const reaction = data.reactionBody!;
    const timestamp = fromFarcasterTime(data.timestamp)._unsafeUnwrap();

    return {
      timestamp: new Date(timestamp),
      fid: data.fid,
      targetCastFid: reaction.targetCastId?.fid,
      type: reaction.type,
      hash: message.hash,
      targetCastHash: reaction.targetCastId?.hash,
      targetUrl: reaction.targetUrl,
    } satisfies unknown as Insertable<Tables['reactions']>;
  }
  public async insertOne(message: ReactionAddMessage) {
    const reaction = this.formatReactionAddMessage(message);

    await this.appDb
      .insertInto('reactions')
      .values(reaction)
      .onConflict((oc) => oc.column('hash').doNothing())
      .execute();
  }
  public async deleteOne(message: ReactionRemoveMessage) {
    const res = await this.appDb
      .updateTable('reactions')
      .set({
        deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date(),
      })
      .where('hash', '=', message.hash)
      .execute();
    console.dir(res);
    log.trace('Deleted reaction', message.hash);
  }
}
