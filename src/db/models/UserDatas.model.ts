import { UserDataAddMessage, fromFarcasterTime } from '@farcaster/core';
import type { Insertable } from 'kysely';
import type { AppDb } from '../db';
import type { Tables } from '../db.types';

export class UserDatas {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  private formatUserDataAddMessage(message: UserDataAddMessage) {
    const data = message.data!;
    const userDataAddBody = data.userDataBody!;
    const timestamp = fromFarcasterTime(data.timestamp)._unsafeUnwrap();

    return {
      timestamp: new Date(timestamp),
      fid: data.fid,
      type: userDataAddBody.type,
      hash: message.hash,
      value: userDataAddBody.value,
    } satisfies Insertable<Tables['userDatas']>;
    // })
  }
  public async insertOne(message: UserDataAddMessage) {
    const userDatas = this.formatUserDataAddMessage(message);

    await this.appDb
      .insertInto('userDatas')
      .values(userDatas)
      .onConflict((oc) =>
        oc.columns(['fid', 'type']).doUpdateSet((eb) => ({
          value: eb.ref('excluded.value'),
        })),
      )
      .execute();
  }
  // public async deleteOne(message: UserDataRemoveMessage) {
  //   const res = await this.appDb
  //     .updateTable('userDatas')
  //     .set({
  //       deletedAt: farcasterTimeToDate(message.data.timestamp) || new Date(),
  //     })
  //     .where('hash', '=', message.hash)
  //     .execute();
  //   console.dir(res);
  //   log.trace('Deleted userData', message.hash);
  // }
}
