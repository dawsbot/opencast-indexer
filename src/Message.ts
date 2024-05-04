import {
  Message,
  isCastAddMessage,
  isCastRemoveMessage,
  isReactionAddMessage,
} from '@farcaster/hub-nodejs';
import { MessageState } from '@farcaster/shuttle';
import { AppDb } from './db/db';
import { Casts } from './db/models/Casts.model';
import { Reactions } from './db/models/Reactions.model';
import { log } from './log';

/**
 * Handles interaction with the database for any message
 */
export class MessageWriter {
  private appDb: AppDb;
  public constructor(appDb: AppDb) {
    this.appDb = appDb;
  }
  public async writeMessage(message: Message, state: MessageState) {
    if (isCastAddMessage(message) && state === 'created') {
      const casts = new Casts(this.appDb);
      await casts.insertOne(message);
    } else if (isCastRemoveMessage(message) && state === 'deleted') {
      const casts = new Casts(this.appDb);
      await casts.deleteOne(message);
    } else if (isReactionAddMessage(message)) {
      const reactions = new Reactions(this.appDb);
      await reactions.insertOne(message);
    } else {
      console.dir(message.data);
      log.info(
        'Message handler not implemented for this message type: ' +
          message.data,
      );
      //   throw new Error(
      //     "Message handler not implemented for this message type: " +
      //       message.data?.type
      //   );
    }
  }
}
