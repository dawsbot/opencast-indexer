import {
  Message,
  isCastAddMessage,
  isCastRemoveMessage,
  isLinkAddMessage,
  isLinkRemoveMessage,
  isReactionAddMessage,
  isReactionRemoveMessage,
  isUserDataAddMessage,
  isVerificationAddAddressMessage,
  isVerificationRemoveMessage,
} from '@farcaster/hub-nodejs';
import { MessageState } from '@farcaster/shuttle';
import { AppDb } from './db/db';
import { Casts } from './db/models/Casts.model';
import { Links } from './db/models/Links.model';
import { Reactions } from './db/models/Reactions.model';
import { UserDatas } from './db/models/UserDatas.model';
import { Verifications } from './db/models/Verifications.Model';

/**
 * Handles interaction with the database for any message
 */
export class MessageWriter {
  private appDb: AppDb;
  public constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  /**
   * Parse messages and update postgresql
   * https://docs.farcaster.xyz/reference/hubble/datatypes/messages#_1-4-message-type
   */
  public async writeMessage(message: Message, state: MessageState) {
    if (isCastAddMessage(message)) {
      if (state === 'created') {
        const casts = new Casts(this.appDb);
        await casts.insertOne(message);
      }
    } else if (isCastRemoveMessage(message)) {
      if (state === 'deleted') {
        const casts = new Casts(this.appDb);
        await casts.deleteOne(message);
      }
    } else if (isReactionAddMessage(message)) {
      const reactions = new Reactions(this.appDb);
      await reactions.insertOne(message);
    } else if (isReactionRemoveMessage(message)) {
      const reactions = new Reactions(this.appDb);
      await reactions.deleteOne(message);
    } else if (isLinkAddMessage(message)) {
      const links = new Links(this.appDb);
      await links.insertOne(message);
    } else if (isLinkRemoveMessage(message)) {
      const links = new Links(this.appDb);
      await links.deleteOne(message);
    } else if (isUserDataAddMessage(message)) {
      const userDatas = new UserDatas(this.appDb);
      await userDatas.insertOne(message);
    } else if (isVerificationAddAddressMessage(message)) {
      const verifications = new Verifications(this.appDb);
      await verifications.insertOne(message);
    } else if (isVerificationRemoveMessage(message)) {
      const verifications = new Verifications(this.appDb);
      await verifications.deleteOne(message);
    } else {
      //   if (message.data?.type === 1) {
      //     console.dir({ data: message.data });
      //   }
      //   log.info(
      //     'Message handler not implemented for this message type: ' +
      //       message.data?.type,
      //   );
      throw new Error(
        'Message handler not implemented for this message type: ' +
          message.data?.type,
      );
    }
  }
}
