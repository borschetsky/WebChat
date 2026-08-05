import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Snackbar } from '@mui/material';
import AppShell, { useIsMobile } from '@/app/AppShell';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  useGetProfileQuery,
  useGetThreadsQuery,
  useGetMessagesQuery,
  useSearchThreadQuery,
  useLazySearchDirectoryQuery,
  useSendMessageMutation,
  useStartThreadMutation,
  useStartGroupMutation,
  useSaveProfileMutation,
  useToggleReactionMutation,
  messagesAdapter,
} from '@/app/api/chatApi';
import ThreadList from '@/features/threads/ThreadList';
import ConversationPane from '@/features/messages/ConversationPane';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import ComposeDialog from '@/features/threads/ComposeDialog';
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
  selectTypingIn,
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
  composeOpened,
  composeClosed,
  paneChanged,
  notified,
  notificationDismissed,
  selectActiveThreadId,
  selectQuery,
  selectFilter,
  selectSearchOpen,
  selectSearchQuery,
  selectSettingsOpen,
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
  const { density } = useThemeMode();
  const isMobile = useIsMobile();

  // --- view state -----------------------------------------------------------
  const activeId = useAppSelector(selectActiveThreadId);
  const query = useAppSelector(selectQuery);
  const filter = useAppSelector(selectFilter);
  const searchOpen = useAppSelector(selectSearchOpen);
  const searchQuery = useAppSelector(selectSearchQuery);
  const settingsOpen = useAppSelector(selectSettingsOpen);
  const composeOpen = useAppSelector(selectComposeOpen);
  const pane = useAppSelector(selectPane);
  const snack = useAppSelector(selectSnack);

  // --- realtime overlay -----------------------------------------------------
  const live = useAppSelector(selectLivePatches);
  const unread = useAppSelector(selectUnread);
  const typingIn = useAppSelector(selectTypingIn);

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

  const [triggerDirectory] = useLazySearchDirectoryQuery();
  const [sendMessage] = useSendMessageMutation();
  const [startThread] = useStartThreadMutation();
  const [startGroup] = useStartGroupMutation();
  const [saveProfile] = useSaveProfileMutation();
  const [toggleReaction] = useToggleReactionMutation();

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

  // ComposeDialog runs its search from an effect that lists this among its dependencies, so
  // an inline arrow here re-triggers that effect on every render - and because the effect
  // sets loading state, each run causes the next. The result is an unbounded stream of
  // /api/users/search calls whose responses are all discarded by the following run's
  // cleanup, so the spinner never stops and no result is ever shown. The lazy-query trigger
  // from RTK Query is itself stable, so this identity never changes.
  const handleSearchDirectory = useCallback(
    (term) => triggerDirectory(term).unwrap(),
    [triggerDirectory],
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

  const handleStartGroup = async (name, members) => {
    dispatch(composeClosed());
    try {
      const { threadId } = await startGroup({ name, members }).unwrap();
      await selectThread(threadId);
      notify(`Group “${name}” created`);
    } catch {
      notify('Could not create that group.');
    }
  };

  const handleSaveProfile = async (next) => {
    await saveProfile(next).unwrap();
    notify('Profile updated');
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
          typing={typingIn === activeId && !!activeId}
          receipt={receipt}
          onBack={() => dispatch(paneChanged('list'))}
          onToggleSearch={() => dispatch(searchToggled())}
          onSearchQuery={(v) => dispatch(searchQueryChanged(v))}
          onOpenSettings={() => dispatch(settingsOpened())}
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
        onClose={() => dispatch(settingsClosed())}
        profile={profile}
        members={active?.members ?? []}
        threadName={active?.name}
        onSaveProfile={handleSaveProfile}
        onUploadAvatar={handleUploadAvatar}
        onLogout={onSignOut}
        fullWidth={isMobile}
      />

      <ComposeDialog
        open={composeOpen}
        onClose={() => dispatch(composeClosed())}
        onStart={handleStartThread}
        onStartGroup={handleStartGroup}
        onSearch={handleSearchDirectory}
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
