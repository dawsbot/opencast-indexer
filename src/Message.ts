import {
  Message,
  isCastAddMessage,
  isCastRemoveMessage,
  isLinkAddMessage,
  isLinkRemoveMessage,
  isReactionAddMessage,
  isReactionRemoveMessage,
  isUserDataAddMessage,
} from '@farcaster/hub-nodejs';
import { MessageState } from '@farcaster/shuttle';
import { AppDb } from './db/db';
import { Casts } from './db/models/Casts.model';
import { Links } from './db/models/Links.model';
import { Reactions } from './db/models/Reactions.model';
import { UserDatas } from './db/models/UserDatas.model';
import { log } from './log';

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
    if (isCastAddMessage(message) && state === 'created') {
      const casts = new Casts(this.appDb);
      await casts.insertOne(message);
    } else if (isCastRemoveMessage(message) && state === 'deleted') {
      const casts = new Casts(this.appDb);
      await casts.deleteOne(message);
    } else if (isReactionAddMessage(message)) {
      //   log.info('Adding message: ' + message.data.reactionBody);
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
    } else {
      console.dir(message.data);
      log.info(
        'Message handler not implemented for this message type: ' +
          message.data?.type,
      );
      //   throw new Error(
      //     "Message handler not implemented for this message type: " +
      //       message.data?.type
      //   );
    }
  }
}
