import type { AppDb } from '../db';
import type { Insertable } from 'kysely';
import type { Tables } from '../db.types';
import { log } from '../../log';
import {
  ReactionAddMessage,
  ReactionRemoveMessage,
  fromFarcasterTime,
} from '@farcaster/core';

export class Reactions {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  //   private formatReactionAddMessage(message: ReactionAddMessage) {
  //     const data = message.data;
  //     const reactionAddBody = data.ReactionAddMessage
  //     const timestamp = fromFarreactionerTime(data.timestamp)._unsafeUnwrap();

  //     return {
  //       timestamp: new Date(timestamp),
  //       fid: data.fid,
  //       parentFid: reactionAddBody.parentReactionId?.fid,
  //       hash: message.hash,
  //       parentHash: reactionAddBody.parentReactionId?.hash,
  //       parentUrl: reactionAddBody.parentUrl,
  //       text: reactionAddBody.text,
  //       embeds: JSON.stringify(reactionAddBody.embeds),
  //       mentions: JSON.stringify(reactionAddBody.mentions),
  //       mentionsPositions: JSON.stringify(reactionAddBody.mentionsPositions),
  //     } satisfies Insertable<Tables["reactions"]>;
  //   }
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
  //   public async deleteOne(message: ReactionRemoveMessage) {
  //     await this.appDb
  //       .updateTable("reactions")
  //       .set({
  //         deletedAt:
  //           farreactionerTimeToDate(message.data.timestamp) || new Date(),
  //       })
  //       .where("hash", "=", message.hash)
  //       .execute();
  //     log.trace("Deleted reaction", message.hash);
  //   }
}
