import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Snackbar } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AppShell, { useIsMobile } from '@/app/AppShell';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  useGetProfileQuery,
  useGetThreadsQuery,
  useGetMessagesQuery,
  useSearchThreadQuery,
  useSendMessageMutation,
  useStartThreadMutation,
  useStartGroupMutation,
  useSaveProfileMutation,
  useToggleReactionMutation,
  useGetGroupQuery,
  useRenameGroupMutation,
  useRemoveGroupMemberMutation,
  useSetGroupRoleMutation,
  useTransferGroupOwnershipMutation,
  useSetGroupPermissionsMutation,
  groupErrorCode,
  groupErrorMessage,
  messagesAdapter,
} from '@/app/api/chatApi';
import ThreadList from '@/features/threads/ThreadList';
import ConversationPane from '@/features/messages/ConversationPane';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import ComposeDialog from '@/features/threads/ComposeDialog';
import GroupInfoDrawer from '@/features/threads/GroupInfoDrawer';
import { useThemeMode } from '@/theme/ThemeModeProvider';
import {
  uploadAvatar,
  recropAvatar,
  removeAvatar,
  restoreAvatar,
  getAvatarOriginal,
} from '@/services';
import { markThreadRead, markAllThreadsRead, readReceiptFor } from '@/services/chat-service';
import { invokeHub } from '@/features/realtime/signalrMiddleware';
import {
  realtimeStarted,
  unreadCleared,
  allUnreadCleared,
  selectLivePatches,
  selectUnread,
  selectTyping,
  selectTypingUsersIn,
} from '@/features/realtime/realtimeSlice';
import { composerCleared, replyStarted, takeDraftFile } from '@/features/composer/composerSlice';
import {
  threadSelected,
  queryChanged,
  filterChanged,
  searchToggled,
  searchQueryChanged,
  settingsOpened,
  settingsClosed,
  infoOpened,
  infoClosed,
  composeOpened,
  composeClosed,
  paneChanged,
  notified,
  notifiedWithUndo,
  notificationDismissed,
  threadClosed,
  selectActiveThreadId,
  selectQuery,
  selectFilter,
  selectSearchOpen,
  selectSearchQuery,
  selectSettingsOpen,
  selectInfoOpen,
  selectComposeOpen,
  selectPane,
  selectSnack,
  selectSnackUndo,
} from '@/features/ui/uiSlice';

const TYPING_IDLE_MS = 3000;
const EMPTY_MESSAGES = messagesAdapter.getInitialState();
const { selectAll: selectAllMessages } = messagesAdapter.getSelectors();

/**
 * The chat screen. Composition and data wiring only.
 *
 * Server data comes from RTK Query, view state from uiSlice, composer state from
 * composerSlice, and everything hub-derived from realtimeSlice. There is no local
 * component state left.
 *
 * This component does not subscribe to the composer draft - Composer passes its contents
 * up on send - so typing never re-renders the message list.
 */
export default function ChatApp({ user, onSignOut }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { density } = useThemeMode();
  const isMobile = useIsMobile();

  // --- view state -----------------------------------------------------------
  const activeId = useAppSelector(selectActiveThreadId);
  const query = useAppSelector(selectQuery);
  const filter = useAppSelector(selectFilter);
  const searchOpen = useAppSelector(selectSearchOpen);
  const searchQuery = useAppSelector(selectSearchQuery);
  const settingsOpen = useAppSelector(selectSettingsOpen);
  const infoOpen = useAppSelector(selectInfoOpen);
  const composeOpen = useAppSelector(selectComposeOpen);
  const pane = useAppSelector(selectPane);
  const snack = useAppSelector(selectSnack);
  const snackUndo = useAppSelector(selectSnackUndo);

  // --- realtime overlay -----------------------------------------------------
  const live = useAppSelector(selectLivePatches);
  const unread = useAppSelector(selectUnread);
  const typing = useAppSelector(selectTyping);

  // --- server data ----------------------------------------------------------
  const { data: profile } = useGetProfileQuery(undefined, { skip: !user });
  const {
    data: threads = [],
    isLoading: loadingThreads,
    isError: threadsFailed,
  } = useGetThreadsQuery(undefined, { skip: !user });
  const { data: messageCache = EMPTY_MESSAGES, isFetching: loadingMessages } = useGetMessagesQuery(
    activeId,
    { skip: !activeId },
  );

  const term = searchQuery.trim();
  const { data: searchResults } = useSearchThreadQuery(
    { threadId: activeId, term },
    { skip: !searchOpen || !activeId || term.length === 0 },
  );

  const [sendMessage] = useSendMessageMutation();
  const [startThread] = useStartThreadMutation();
  // The mutation's own isLoading, rather than a copy of it inside the dialog.
  const [startGroup, startGroupState] = useStartGroupMutation();
  // The mutation's own result is the source of truth for "saving" and "what went wrong" -
  // SettingsDrawer used to keep a second copy of both in local state and derive the message
  // from a caught exception.
  const [saveProfile, saveProfileState] = useSaveProfileMutation();
  const [toggleReaction] = useToggleReactionMutation();

  const [renameGroup] = useRenameGroupMutation();
  const [removeGroupMember] = useRemoveGroupMemberMutation();
  const [setGroupRole] = useSetGroupRoleMutation();
  const [transferGroupOwnership] = useTransferGroupOwnershipMutation();
  const [setGroupPermissions] = useSetGroupPermissionsMutation();

  const stopTypingTimer = useRef(null);
  const notify = useCallback((msg) => dispatch(notified(msg)), [dispatch]);

  // Open the hub for a session restored from storage; sign-in connects via its own action.
  useEffect(() => {
    if (user) dispatch(realtimeStarted());
  }, [user, dispatch]);

  // A failed thread load means the token is no longer good.
  //
  // This depends on a callback prop, which is the shape that produced the search render
  // loop: an unstable onSignOut would re-run the effect on every render and sign out
  // repeatedly for as long as threadsFailed held. It is safe only because App.jsx wraps
  // signOut in useCallback - so that wrapping is load-bearing, not tidiness.
  useEffect(() => {
    if (threadsFailed) onSignOut();
  }, [threadsFailed, onSignOut]);

  const messages = useMemo(() => selectAllMessages(messageCache), [messageCache]);

  const decorated = useMemo(
    () => threads.map((t) => ({ ...t, ...live[t.id], unread: unread[t.id] ?? 0 })),
    [threads, live, unread],
  );
  const active = decorated.find((t) => t.id === activeId) ?? null;

  // Only while the drawer is open on a group. `version` is a concurrency token, and keeping
  // one subscribed for every thread in the list would be forty tokens going stale.
  const { data: group, isFetching: loadingGroup } = useGetGroupQuery(activeId, {
    skip: !infoOpen || !activeId || !active?.group,
  });

  // --- actions --------------------------------------------------------------
  const selectThread = useCallback(
    async (id) => {
      dispatch(threadSelected(id));
      dispatch(composerCleared());
      await markThreadRead(id);
      dispatch(unreadCleared(id));
    },
    [dispatch],
  );

  // Everything below is wrapped in useCallback because it is handed to memoized rows.
  // Without stable identities React.memo compares a fresh function every render, so the
  // whole message list re-renders anyway and the memo is decorative.
  const handleTyping = useCallback(
    (value) => {
      if (!activeId) return;
      if (!value) {
        invokeHub('OnStopTyping', activeId);
        return;
      }
      invokeHub('OnTyping', activeId);
      clearTimeout(stopTypingTimer.current);
      stopTypingTimer.current = setTimeout(
        () => invokeHub('OnStopTyping', activeId),
        TYPING_IDLE_MS,
      );
    },
    [activeId],
  );

  /** Payload comes from Composer so this component never subscribes to the draft. */
  const handleSend = useCallback(
    ({ text, replyTo, attachment }) => {
      if (!activeId || (!text && !attachment)) return;
      const file = attachment ? takeDraftFile(attachment.key) : null;
      dispatch(composerCleared());
      invokeHub('OnStopTyping', activeId);
      // A failure leaves the row in the cache marked 'failed' with a Retry, so nothing to catch.
      sendMessage({ threadId: activeId, text, username: profile?.name, replyTo, file })
        .unwrap()
        .catch(() => {});
    },
    [activeId, dispatch, profile?.name, sendMessage],
  );

  const handleRetry = useCallback(
    (message) => {
      sendMessage({
        threadId: message.threadId,
        text: message.text,
        username: profile?.name,
        replyTo: message.quote,
        retryOf: message.id,
      })
        .unwrap()
        .catch(() => {});
    },
    [profile?.name, sendMessage],
  );

  const handleReact = useCallback(
    (messageId, emoji) => toggleReaction({ threadId: activeId, messageId, emoji }),
    [activeId, toggleReaction],
  );

  const handleReply = useCallback(
    (m) => dispatch(replyStarted({ author: m.author, text: m.text })),
    [dispatch],
  );

  const handleStartThread = async (person) => {
    dispatch(composeClosed());
    try {
      const { threadId, existed } = await startThread(person).unwrap();
      await selectThread(threadId);
      notify(
        existed
          ? `You already had a conversation with ${person.name}`
          : `Conversation with ${person.name} started`,
      );
    } catch {
      notify('Could not start that conversation.');
    }
  };

  // `name` is whatever the user typed, and blank is the expected path rather than an error -
  // the dialog shows the auto-name as a placeholder. Blank is sent as blank and stored as
  // null, so the title derives from membership on every read instead of being snapshotted
  // here, which is what made it go stale when someone left the group.
  const handleStartGroup = async (members, name = '') => {
    dispatch(composeClosed());
    try {
      const { threadId } = await startGroup({ name: name.trim(), members }).unwrap();
      await selectThread(threadId);
      notify(`Group created with ${members.length} people`);
    } catch (error) {
      // A workspace can restrict group creation to admins (#75), and a member who hits that
      // needs to be told which it is: "Could not create that group" reads as a fault and
      // invites a retry that will fail identically. The server sends a code and a sentence
      // precisely so this does not have to guess.
      const refusal = error?.data;
      notify(
        refusal?.error === 'groups_admin_only' && refusal.message
          ? refusal.message
          : 'Could not create that group.',
      );
    }
  };

  // Deliberately not `.unwrap()`: unwrapping rethrows, which is what forced the drawer to
  // catch and keep its own error copy. The failure is already on saveProfileState.
  const handleSaveProfile = async (next) => {
    const result = await saveProfile(next);
    if (!result.error) notify('Profile updated');
  };

  /**
   * Posts a confirmed crop.
   *
   * Two endpoints, chosen by whether an original came with it, because the server deletes
   * different things: a new photo drops the previous crop *and* the previous original, while a
   * re-crop drops the crop and keeps the original - which is the only reason a crop can be
   * adjusted twice.
   *
   * The crop rectangle goes as four fields rather than a JSON part: it is four numbers, and
   * the number formatting is the only thing that can go wrong. `String(number)` always writes
   * a dot, and the server parses with InvariantCulture, so the pair agree on every machine.
   */
  const handleUploadAvatar = async ({ file, crop, original }) => {
    const form = new FormData();
    form.append('file', file);
    if (original) form.append('original', original);
    if (crop) {
      form.append('cropX', String(crop.x));
      form.append('cropY', String(crop.y));
      form.append('cropWidth', String(crop.width));
      form.append('cropHeight', String(crop.height));
    }

    try {
      await (original ? uploadAvatar(form, user.token) : recropAvatar(form, user.token));
      // The hub broadcasts ReciveAvatar, which invalidates the profile for everyone - which is
      // also what refreshes hasOriginalPhoto and avatarCrop for this user.
      notify(original ? 'Avatar updated' : 'Crop updated');
    } catch {
      notify('Avatar upload failed.');
    }
  };

  /**
   * Removes the profile photo (#89).
   *
   * **No confirmation dialog, by design** - the handoff is explicit, and the snackbar's Undo is
   * what buys that. The server deletes nothing: it sets a retention marker, so Undo restores
   * the photo *and* the crop exactly rather than approximately.
   *
   * The Undo is offered only when the server says there was something to put back. Removing a
   * photo that was already gone is a success, but offering to undo it would be a button that
   * cannot do anything.
   */
  const handleRemoveAvatar = async () => {
    try {
      const response = await removeAvatar(user.token);

      if (response?.data?.restorable === false) {
        notify('Profile photo removed');
        return;
      }

      dispatch(notifiedWithUndo({ message: 'Profile photo removed', undo: 'avatarRemoved' }));
    } catch {
      notify('Could not remove your photo.');
    }
  };

  /**
   * Undo. Sends nothing but the token - the server knows which keys to restore, and accepting
   * a file name here would let a client point its avatar at any object in the bucket.
   *
   * A refusal is reported rather than swallowed. The server answers 409 when there is genuinely
   * nothing to bring back, which is what a very late Undo gets, and a button that appears to do
   * nothing is exactly the outcome #89 rules out.
   */
  const handleUndoRemoveAvatar = async () => {
    try {
      await restoreAvatar(user.token);
      notify('Photo restored');
    } catch {
      notify('That photo could not be restored.');
    }
  };

  /**
   * Which handler the snackbar's Undo runs, keyed by what `uiSlice` recorded.
   *
   * A lookup rather than a callback in the store: state has to stay serializable. One entry
   * today, and the shape is what stops the second one being a special case.
   */
  const undoActions = { avatarRemoved: handleUndoRemoveAvatar };

  /**
   * Fetches the stored original back so it can be re-cropped, as a `File` the cropper can
   * decode. Returns null on failure, having said so - the drawer then simply does not open,
   * rather than opening on a photo that is not there.
   */
  const handleLoadOriginal = async () => {
    try {
      const response = await getAvatarOriginal(user.token);
      const blob = response?.data;
      if (!blob) throw new Error('no body');

      // A File, not a Blob: `cropToFile` reads `file.name` to build the uploaded filename, and
      // a bare Blob has none. The extension is cosmetic - the server derives the stored one
      // from the magic bytes - but a nameless part posts as "blob".
      return new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
    } catch {
      notify('Could not load your photo to adjust.');
      return null;
    }
  };

  /**
   * Runs a group mutation and decides whether the user hears about a failure.
   *
   * A VERSION_CONFLICT is deliberately silent. It survived the retry inside the endpoint,
   * the cache has already adopted the server's group, and the user neither caused it nor
   * can act on it - the spec is explicit that a conflict is not a toast. Everything else
   * failed the user's actual intent, so it says what went wrong, in the server's words.
   */
  const runGroupAction = async (promise) => {
    const result = await promise;
    if (!result.error) return true;
    if (groupErrorCode(result.error) !== 'VERSION_CONFLICT') {
      notify(groupErrorMessage(result.error) ?? 'That change could not be applied.');
    }
    return false;
  };

  const groupArgs = { groupId: activeId, version: group?.version ?? 0 };

  const handleRenameGroup = (name) => runGroupAction(renameGroup({ ...groupArgs, name }));

  const handleSetGroupRole = (userId, gRole) =>
    runGroupAction(setGroupRole({ ...groupArgs, userId, gRole }));

  const handleTransferOwnership = (userId) =>
    runGroupAction(transferGroupOwnership({ ...groupArgs, userId }));

  const handleRemoveMember = (userId) =>
    runGroupAction(removeGroupMember({ ...groupArgs, userId }));

  const handleSetPermission = (key, rule) =>
    runGroupAction(setGroupPermissions({ ...groupArgs, perms: { [key]: rule } }));

  // Leaving is a removal of yourself, which the server treats as its own case: it bypasses
  // the remove permission, and is refused for the owner, who must transfer first.
  const handleLeaveGroup = async () => {
    const left = await runGroupAction(removeGroupMember({ ...groupArgs, userId: user.id }));
    if (left) {
      dispatch(infoClosed());
      dispatch(threadClosed(activeId));
      notify('You left the group');
    }
  };

  // --- derived --------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const visibleThreads = decorated
    .filter((t) => (filter === 'unread' ? t.unread > 0 : filter === 'groups' ? t.group : true))
    .filter(
      (t) => !q || t.name.toLowerCase().includes(q) || (t.preview ?? '').toLowerCase().includes(q),
    );

  const shown = term && searchResults ? searchResults : messages;
  const lastOwn = [...shown].reverse().find((m) => m.own && !m.status);
  const receiptInfo = readReceiptFor(active);
  const receipt =
    lastOwn && receiptInfo ? { messageId: lastOwn.id, label: receiptInfo.label } : null;

  return (
    <>
      <AppShell
        pane={pane}
        sidebar={
          <ThreadList
            threads={visibleThreads}
            allThreads={decorated}
            activeId={activeId}
            query={query}
            tab={filter}
            density={density}
            loading={loadingThreads}
            profile={profile}
            unreadTotal={decorated.reduce((a, t) => a + t.unread, 0)}
            onQuery={(v) => dispatch(queryChanged(v))}
            onTab={(v) => dispatch(filterChanged(v))}
            onSelect={selectThread}
            onCompose={() => dispatch(composeOpened())}
            onSettings={() => dispatch(settingsOpened())}
            onMarkAllRead={async () => {
              await markAllThreadsRead();
              dispatch(allUnreadCleared());
              notify('All conversations marked as read');
            }}
          />
        }
      >
        <ConversationPane
          thread={active}
          messages={shown}
          loading={loadingMessages}
          density={density}
          isMobile={isMobile}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchCount={shown.length}
          totalCount={messages.length}
          typingUsers={selectTypingUsersIn(typing, activeId)}
          receipt={receipt}
          onBack={() => dispatch(paneChanged('list'))}
          onToggleSearch={() => dispatch(searchToggled())}
          onSearchQuery={(v) => dispatch(searchQueryChanged(v))}
          // "Conversation details" means the conversation, not the app. A direct thread has
          // no details of its own yet, so it still falls through to settings rather than
          // opening a drawer with one avatar and nothing to do in it.
          onOpenSettings={() => dispatch(active?.group ? infoOpened() : settingsOpened())}
          onSend={handleSend}
          onTyping={handleTyping}
          onReact={handleReact}
          onReply={handleReply}
          onRetry={handleRetry}
          onCompose={() => dispatch(composeOpened())}
        />
      </AppShell>

      <SettingsDrawer
        open={settingsOpen}
        // Resetting the mutation here rather than clearing an error flag in the drawer: the
        // failure lives on the mutation, so closing the drawer is what should discard it.
        onClose={() => {
          dispatch(settingsClosed());
          saveProfileState.reset();
        }}
        saving={saveProfileState.isLoading}
        saveError={saveProfileState.error}
        profile={profile}
        members={active?.members ?? []}
        threadName={active?.name}
        onSaveProfile={handleSaveProfile}
        onUploadAvatar={handleUploadAvatar}
        onLoadOriginal={handleLoadOriginal}
        onRemoveAvatar={handleRemoveAvatar}
        onLogout={onSignOut}
        onOpenAdmin={() => navigate('/admin')}
        fullWidth={isMobile}
      />

      <GroupInfoDrawer
        open={infoOpen && !!active?.group}
        onClose={() => dispatch(infoClosed())}
        group={group}
        loading={loadingGroup}
        meId={user?.id ?? null}
        fullWidth={isMobile}
        onRename={handleRenameGroup}
        onSetRole={handleSetGroupRole}
        onTransferOwnership={handleTransferOwnership}
        onRemoveMember={handleRemoveMember}
        onSetPermission={handleSetPermission}
        onLeave={handleLeaveGroup}
      />

      <ComposeDialog
        open={composeOpen}
        onClose={() => dispatch(composeClosed())}
        onStart={handleStartThread}
        onStartGroup={handleStartGroup}
        creating={startGroupState.isLoading}
        fullScreen={isMobile}
      />

      {/* One snackbar for the whole app, now able to carry an action. The Undo dismisses the
          snackbar itself: leaving it up would offer to undo something that has just been
          undone, and pressing it twice is only harmless because the server treats the second
          press as a request for a state that already holds.

          Twice as long when there is something to undo. Four seconds is enough to read a
          confirmation; it is not enough to notice a mistake, decide, and reach the button -
          and this is the only control standing where a confirm dialog would have. */}
      <Snackbar
        open={!!snack}
        message={snack}
        autoHideDuration={snackUndo ? 8000 : 4000}
        onClose={() => dispatch(notificationDismissed())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        action={
          snackUndo && undoActions[snackUndo] ? (
            <Button
              color="primary"
              size="small"
              onClick={() => {
                dispatch(notificationDismissed());
                undoActions[snackUndo]();
              }}
            >
              Undo
            </Button>
          ) : null
        }
      />
    </>
  );
}
