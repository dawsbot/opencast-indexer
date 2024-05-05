import {
  VerificationAddAddressMessage,
  VerificationRemoveMessage,
  fromFarcasterTime,
} from '@farcaster/core';
import { Insertable } from 'kysely';
import { log } from '../../log';
import { farcasterTimeToDate } from '../../utils';
import type { AppDb } from '../db';
import { Tables } from '../db.types';

export class Verifications {
  private appDb: AppDb;
  constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  private formatVerificationAddAddressMessage(
    message: VerificationAddAddressMessage,
  ) {
    const data = message.data!;
    const addAddressBody = data.verificationAddAddressBody!;
    const timestamp = fromFarcasterTime(data.timestamp)._unsafeUnwrap();

    return {
      timestamp: new Date(timestamp),
      fid: data.fid,
      hash: message.hash,
      signerAddress: addAddressBody.address,
      blockHash: addAddressBody.blockHash,
      signature: addAddressBody.claimSignature,
    } satisfies Insertable<Tables['verifications']>;
  }
  public async insertOne(message: VerificationAddAddressMessage) {
    const verification = this.formatVerificationAddAddressMessage(message);

    await this.appDb
      .insertInto('verifications')
      .values(verification)
      .onConflict((oc) => oc.columns(['fid', 'signerAddress']).doNothing())
      .execute();
  }
  public async deleteOne(message: VerificationRemoveMessage) {
    await this.appDb
      .updateTable('verifications')
      .set({
        deletedAt: farcasterTimeToDate(message.data.timestamp),
      })
      .where('hash', '=', message.hash)
      .execute();
    log.trace('Deleted verification', message.hash);
  }
}
