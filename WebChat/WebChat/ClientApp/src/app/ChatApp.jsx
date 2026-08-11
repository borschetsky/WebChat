import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Snackbar } from '@mui/material';
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
import { uploadAvatar } from '@/services';
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
    } catch {
      notify('Could not create that group.');
    }
  };

  // Deliberately not `.unwrap()`: unwrapping rethrows, which is what forced the drawer to
  // catch and keep its own error copy. The failure is already on saveProfileState.
  const handleSaveProfile = async (next) => {
    const result = await saveProfile(next);
    if (!result.error) notify('Profile updated');
  };

  const handleUploadAvatar = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      await uploadAvatar(form, user.token);
      // The hub broadcasts ReciveAvatar, which invalidates the profile for everyone.
      notify('Avatar updated');
    } catch {
      notify('Avatar upload failed.');
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

      <Snackbar
        open={!!snack}
        message={snack}
        autoHideDuration={4000}
        onClose={() => dispatch(notificationDismissed())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </>
  );
}
