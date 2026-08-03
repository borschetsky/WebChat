import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Quote } from '@/types/models';

/**
 * Composer state.
 *
 * This slice exists mainly to fix a measured performance problem: `draft` used to live in
 * ChatApp, so every keystroke re-rendered ChatApp, ConversationPane and every MessageRow.
 * With the draft here, only the Composer subscribes to it and the message list is
 * untouched while typing.
 *
 * File objects are not serializable, so the attachment is kept as plain metadata plus a
 * key into a module-level map - putting a File in the store would break time-travel
 * debugging and RTK's serializability check.
 */

export interface DraftAttachment {
  key: string;
  name: string;
  size: number;
}

/** Files live outside the store; the slice only holds a key. */
const files = new Map<string, File>();
export const takeDraftFile = (key: string): File | undefined => files.get(key);
export const releaseDraftFile = (key: string) => { files.delete(key); };

let seq = 0;
export const registerDraftFile = (file: File): DraftAttachment => {
  const key = `f${++seq}`;
  files.set(key, file);
  return { key, name: file.name, size: file.size };
};

interface ComposerState {
  draft: string;
  replyTo: Quote | null;
  attachment: DraftAttachment | null;
}

const initialState: ComposerState = { draft: '', replyTo: null, attachment: null };

const composerSlice = createSlice({
  name: 'composer',
  initialState,
  reducers: {
    draftChanged(state, action: PayloadAction<string>) {
      state.draft = action.payload;
    },
    replyStarted(state, action: PayloadAction<Quote>) {
      state.replyTo = action.payload;
    },
    replyCancelled(state) {
      state.replyTo = null;
    },
    attachmentAdded(state, action: PayloadAction<DraftAttachment>) {
      state.attachment = action.payload;
    },
    attachmentRemoved(state) {
      if (state.attachment) releaseDraftFile(state.attachment.key);
      state.attachment = null;
    },
    /** After a successful send, and when switching threads. */
    composerCleared(state) {
      if (state.attachment) releaseDraftFile(state.attachment.key);
      state.draft = '';
      state.replyTo = null;
      state.attachment = null;
    },
  },
  selectors: {
    selectDraft: (state) => state.draft,
    selectReplyTo: (state) => state.replyTo,
    selectAttachment: (state) => state.attachment,
    selectCanSend: (state) => state.draft.trim().length > 0 || state.attachment !== null,
  },
});

export const {
  draftChanged, replyStarted, replyCancelled,
  attachmentAdded, attachmentRemoved, composerCleared,
} = composerSlice.actions;

export const { selectDraft, selectReplyTo, selectAttachment, selectCanSend } =
  composerSlice.selectors;

export default composerSlice.reducer;
