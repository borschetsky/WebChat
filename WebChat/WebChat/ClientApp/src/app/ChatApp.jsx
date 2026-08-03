import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Snackbar } from '@mui/material';
import AppShell, { useIsMobile } from '@/app/AppShell';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import ThreadList from '@/features/threads/ThreadList';
import ConversationPane from '@/features/messages/ConversationPane';
import SettingsDrawer from '@/features/settings/SettingsDrawer';
import ComposeDialog from '@/features/threads/ComposeDialog';
import { useThemeMode } from '@/theme/ThemeModeProvider';
import { useChatConnection } from '@/features/realtime/useChatConnection';
import { avatarColor } from '@/theme/tokens';
import { uploadAvatar } from '@/services';
import {
  loadThreads, loadMessages, searchInThread, searchDirectory, startThreadWith,
  sendMessage, loadProfile, saveProfile,
  toggleReaction, markThreadRead, markAllThreadsRead, readReceiptFor, noteIncomingMessage,
} from '@/services/chat-service';
import { toLiveMessage } from '@/services/adapters';
import { composerCleared, draftChanged, replyStarted, takeDraftFile } from '@/features/composer/composerSlice';
import {
  threadSelected, queryChanged, filterChanged, searchToggled, searchQueryChanged,
  settingsOpened, settingsClosed, composeOpened, composeClosed,
  paneChanged, notified, notificationDismissed,
  selectActiveThreadId, selectQuery, selectFilter, selectSearchOpen, selectSearchQuery,
  selectSettingsOpen, selectComposeOpen, selectPane, selectSnack,
} from '@/features/ui/uiSlice';

const TYPING_IDLE_MS = 3000;

/**
 * The chat screen.
 *
 * View state lives in uiSlice and composer state in composerSlice. Server data - profile,
 * threads, messages - is still local state here; it moves to RTK Query in Phase 3.
 *
 * Note this component does not subscribe to the composer draft. Composer passes its
 * contents up on send instead, so typing never re-renders this tree.
 */
export default function ChatApp({ user, onSignOut }) {
  const dispatch = useAppDispatch();
  const { density } = useThemeMode();
  const isMobile = useIsMobile();
  const token = user?.token;

  // --- view state (store) ---------------------------------------------------
  const activeId = useAppSelector(selectActiveThreadId);
  const query = useAppSelector(selectQuery);
  const filter = useAppSelector(selectFilter);
  const searchOpen = useAppSelector(selectSearchOpen);
  const searchQuery = useAppSelector(selectSearchQuery);
  const settingsOpen = useAppSelector(selectSettingsOpen);
  const composeOpen = useAppSelector(selectComposeOpen);
  const pane = useAppSelector(selectPane);
  const snack = useAppSelector(selectSnack);

  // --- server data (moves to RTK Query in Phase 3) --------------------------
  const [profile, setProfile] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [typing, setTyping] = useState(false);

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const typingTimer = useRef(null);
  const stopTypingTimer = useRef(null);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const notify = useCallback((msg) => dispatch(notified(msg)), [dispatch]);

  // --- initial load ---------------------------------------------------------
  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [p, ts] = await Promise.all([loadProfile(token), loadThreads(token)]);
        if (cancelled) return;
        setProfile(p);
        setThreads(ts);
      } catch {
        if (!cancelled) onSignOut();
      } finally {
        if (!cancelled) setLoadingThreads(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, onSignOut]);

  // --- SignalR --------------------------------------------------------------
  const patchThread = useCallback((predicate, patch) => {
    setThreads((ts) => ts.map((t) => (predicate(t) ? { ...t, ...patch } : t)));
  }, []);

  const handlers = useMemo(() => ({
    ReciveMessage: (payload) => {
      const incoming = toLiveMessage(payload, user.id);
      const isActive = incoming.threadId === activeIdRef.current;

      // MOCK: unread has no server-side watermark, but the trigger is a real hub event.
      const unread = !isActive && !incoming.own ? noteIncomingMessage(incoming.threadId) : undefined;

      patchThread((t) => t.id === incoming.threadId, {
        preview: incoming.text,
        time: incoming.time,
        isTyping: false,
        ...(unread === undefined ? {} : { unread }),
      });

      if (isActive) {
        // The hub echoes to the sender too, so dedupe on id.
        setMessages((ms) => (ms.some((m) => m.id === incoming.id) ? ms : [...ms, incoming]));
        setTyping(false);
      }
    },

    ReviceThread: (vm) => {
      setThreads((ts) => (ts.some((t) => t.id === vm.id) ? ts : [
        {
          id: vm.id,
          opponentId: vm.oponentVM?.id,
          name: vm.oponentVM?.username ?? 'Unknown',
          avatarFileName: vm.oponentVM?.avatarFileName ?? null,
          color: avatarColor(vm.oponentVM?.id ?? vm.id),
          presence: vm.oponentVM?.isOnline ? 'online' : 'offline',
          isTyping: false,
          preview: vm.lastMessage?.text ?? 'No messages yet',
          time: '',
          group: false,
          unread: 0,
          members: [],
        },
        ...ts,
      ]));
    },

    ReciveTypingStatus: ({ userId, threadId, UserId, ThreadId }) => {
      const uid = userId ?? UserId;
      const tid = threadId ?? ThreadId;
      if (!tid) return;
      patchThread((t) => t.id === tid && t.opponentId === uid, { isTyping: true });
      if (tid === activeIdRef.current) {
        setTyping(true);
        clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), TYPING_IDLE_MS);
      }
    },

    ReciveStopTypingStatus: ({ userId, threadId, UserId, ThreadId }) => {
      const uid = userId ?? UserId;
      const tid = threadId ?? ThreadId;
      patchThread((t) => t.id === tid && t.opponentId === uid, { isTyping: false });
      if (tid === activeIdRef.current) setTyping(false);
    },

    ReciveConnectedStatus: (id) => patchThread((t) => t.opponentId === id, { presence: 'online' }),
    ReciveDisconnectedStatus: (id) => patchThread((t) => t.opponentId === id, { presence: 'offline' }),

    ReciveAvatar: ({ body, uploaderId }) => {
      const fileName = body?.value ?? body;
      patchThread((t) => t.opponentId === uploaderId, { avatarFileName: fileName });
      setProfile((p) => (p && p.id === uploaderId ? { ...p, avatarFileName: fileName } : p));
    },

    ReviceUpdatedOpponentProfile: (p) => {
      if (!p) return;
      patchThread((t) => t.opponentId === p.id, { name: p.username });
      setProfile((me) => (me && me.id === p.id ? { ...me, name: p.username, email: p.email } : me));
    },
  }), [patchThread, user?.id]);

  const { invoke } = useChatConnection(token, handlers);

  // --- thread selection -----------------------------------------------------
  const selectThread = useCallback(async (id) => {
    dispatch(threadSelected(id));
    dispatch(composerCleared());
    setSearchResults(null);
    setTyping(false);
    setLoadingMessages(true);
    await markThreadRead(id);
    patchThread((t) => t.id === id, { unread: 0 });
    try {
      setMessages(await loadMessages(id, token));
    } catch {
      setMessages([]);
      notify('Could not load this conversation.');
    } finally {
      setLoadingMessages(false);
    }
  }, [token, patchThread, dispatch, notify]);

  // --- in-thread search (server side) ---------------------------------------
  useEffect(() => {
    const term = searchQuery.trim();
    if (!searchOpen || !activeId) return undefined;
    if (!term) { setSearchResults(null); return undefined; }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const found = await searchInThread(activeId, term, token);
        if (!cancelled) setSearchResults(found);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery, searchOpen, activeId, token]);

  // --- actions --------------------------------------------------------------
  const handleTyping = (value) => {
    if (!activeId) return;
    if (!value) { invoke('OnStopTyping', activeId); return; }
    invoke('OnTyping', activeId);
    clearTimeout(stopTypingTimer.current);
    stopTypingTimer.current = setTimeout(() => invoke('OnStopTyping', activeId), TYPING_IDLE_MS);
  };

  /** Payload comes from Composer so this component never subscribes to the draft. */
  const handleSend = async ({ text, replyTo, attachment }) => {
    if (!activeId || (!text && !attachment)) return;
    const file = attachment ? takeDraftFile(attachment.key) : null;
    dispatch(composerCleared());
    invoke('OnStopTyping', activeId);

    try {
      const sent = await sendMessage(
        { threadId: activeId, text: text || attachment?.name || '', username: profile?.name, replyTo, file },
        token
      );
      setMessages((ms) => (ms.some((m) => m.id === sent.id) ? ms : [...ms, sent]));
      patchThread((t) => t.id === activeId, { preview: sent.text, time: sent.time });
    } catch {
      dispatch(draftChanged(text));
      notify('Message failed to send.');
    }
  };

  const handleReact = async (messageId, emoji) => {
    const next = await toggleReaction(messageId, emoji);
    setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, reactions: next } : m)));
  };

  const handleStartThread = async (person) => {
    dispatch(composeClosed());
    try {
      const { threadId, existed } = await startThreadWith(person, token);
      setThreads(await loadThreads(token));
      await selectThread(threadId);
      notify(existed
        ? `You already had a conversation with ${person.name}`
        : `Conversation with ${person.name} started`);
    } catch {
      notify('Could not start that conversation.');
    }
  };

  const handleSaveProfile = async (next) => {
    setProfile(await saveProfile(next, token));
    notify('Profile updated');
  };

  const handleUploadAvatar = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await uploadAvatar(form, token);
      const fileName = res?.data?.value ?? res?.data;
      setProfile((p) => (p ? { ...p, avatarFileName: fileName } : p));
      notify('Avatar updated');
    } catch {
      notify('Avatar upload failed.');
    }
  };

  // --- derived --------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const visibleThreads = threads
    .filter((t) => (filter === 'unread' ? t.unread > 0 : filter === 'groups' ? t.group : true))
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (t.preview ?? '').toLowerCase().includes(q));

  const shown = searchResults ?? messages;
  const lastOwn = [...shown].reverse().find((m) => m.own);
  const receiptInfo = readReceiptFor(active);
  const receipt = lastOwn && receiptInfo ? { messageId: lastOwn.id, label: receiptInfo.label } : null;

  return (
    <>
      <AppShell
        pane={pane}
        sidebar={
          <ThreadList
            threads={visibleThreads}
            allThreads={threads}
            activeId={activeId}
            query={query}
            tab={filter}
            density={density}
            loading={loadingThreads}
            profile={profile}
            unreadTotal={threads.reduce((a, t) => a + t.unread, 0)}
            onQuery={(v) => dispatch(queryChanged(v))}
            onTab={(v) => dispatch(filterChanged(v))}
            onSelect={selectThread}
            onCompose={() => dispatch(composeOpened())}
            onSettings={() => dispatch(settingsOpened())}
            onMarkAllRead={async () => {
              await markAllThreadsRead();
              setThreads((ts) => ts.map((t) => ({ ...t, unread: 0 })));
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
          typing={typing}
          receipt={receipt}
          onBack={() => dispatch(paneChanged('list'))}
          onToggleSearch={() => { dispatch(searchToggled()); setSearchResults(null); }}
          onSearchQuery={(v) => dispatch(searchQueryChanged(v))}
          onOpenSettings={() => dispatch(settingsOpened())}
          onSend={handleSend}
          onTyping={handleTyping}
          onReact={handleReact}
          onReply={(m) => dispatch(replyStarted({ author: m.author, text: m.text }))}
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
        onSearch={(term) => searchDirectory(term, token)}
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
