import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Snackbar } from '@mui/material';
import AppShell, { useIsMobile } from './AppShell';
import ThreadList from './ThreadList';
import ConversationPane from './ConversationPane';
import SettingsDrawer from './SettingsDrawer';
import ComposeDialog from './ComposeDialog';
import { useThemeMode } from '../../theme-mode';
import { useChatConnection } from '../../hooks/useChatConnection';
import { avatarColor } from '../../theme';
import { uploadAvatar } from '../../services';
import {
  loadThreads, loadMessages, searchInThread, searchDirectory, startThreadWith,
  sendMessage, loadProfile, saveProfile,
  toggleReaction, markThreadRead, markAllThreadsRead, readReceiptFor,
} from '../../services/chat-service';
import { toLiveMessage } from '../../services/adapters';

const TYPING_IDLE_MS = 3000;

/**
 * The chat screen. Replaces the old class-based Dashboard: same API and hub, but the state
 * lives in hooks and every read goes through chat-service so mocked features are invisible
 * at this level.
 */
export default function ChatApp({ user, onSignOut }) {
  const { density } = useThemeMode();
  const isMobile = useIsMobile();
  const token = user?.token;

  const [profile, setProfile] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [activeId, setActiveId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [attachment, setAttachment] = useState(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [snack, setSnack] = useState('');
  const [pane, setPane] = useState('list');

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const typingTimer = useRef(null);
  const stopTypingTimer = useRef(null);

  const active = threads.find((t) => t.id === activeId) ?? null;

  // --- initial load ---------------------------------------------------------
  useEffect(() => {
    if (!token) return;
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
      patchThread((t) => t.id === incoming.threadId, {
        preview: incoming.text,
        time: incoming.time,
        isTyping: false,
      });
      if (incoming.threadId === activeIdRef.current) {
        // The hub echoes to the sender too, so the REST response and this event can be the
        // same message - dedupe on id rather than showing it twice.
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
    setActiveId(id);
    setPane('chat');
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults(null);
    setReplyTo(null);
    setTyping(false);
    setLoadingMessages(true);
    await markThreadRead(id);
    patchThread((t) => t.id === id, { unread: 0 });
    try {
      setMessages(await loadMessages(id, token));
    } catch {
      setMessages([]);
      setSnack('Could not load this conversation.');
    } finally {
      setLoadingMessages(false);
    }
  }, [token, patchThread]);

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

  const handleSend = async () => {
    const text = draft.trim();
    if (!activeId || (!text && !attachment)) return;
    setDraft('');
    const sentReply = replyTo;
    const sentFile = attachment;
    setReplyTo(null);
    setAttachment(null);
    invoke('OnStopTyping', activeId);

    try {
      const sent = await sendMessage(
        { threadId: activeId, text: text || sentFile?.name || '', username: profile?.name, replyTo: sentReply, file: sentFile },
        token
      );
      setMessages((ms) => (ms.some((m) => m.id === sent.id) ? ms : [...ms, sent]));
      patchThread((t) => t.id === activeId, { preview: sent.text, time: sent.time });
    } catch {
      setDraft(text);
      setSnack('Message failed to send.');
    }
  };

  const handleReact = async (messageId, emoji) => {
    const next = await toggleReaction(messageId, emoji);
    setMessages((ms) => ms.map((m) => (m.id === messageId ? { ...m, reactions: next } : m)));
  };

  const handleStartThread = async (person) => {
    setComposeOpen(false);
    try {
      const { threadId, existed } = await startThreadWith(person, token);
      const refreshed = await loadThreads(token);
      setThreads(refreshed);
      await selectThread(threadId);
      setSnack(existed ? `You already had a conversation with ${person.name}` : `Conversation with ${person.name} started`);
    } catch {
      setSnack('Could not start that conversation.');
    }
  };

  const handleSaveProfile = async (next) => {
    const saved = await saveProfile(next, token);
    setProfile(saved);
    setSnack('Profile updated');
  };

  const handleUploadAvatar = async (file) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await uploadAvatar(form, token);
      const fileName = res?.data?.value ?? res?.data;
      setProfile((p) => (p ? { ...p, avatarFileName: fileName } : p));
      setSnack('Avatar updated');
    } catch {
      setSnack('Avatar upload failed.');
    }
  };

  // --- derived --------------------------------------------------------------
  const q = query.trim().toLowerCase();
  const visibleThreads = threads
    .filter((t) => (tab === 'unread' ? t.unread > 0 : tab === 'groups' ? t.group : true))
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
            activeId={activeId}
            query={query}
            tab={tab}
            density={density}
            loading={loadingThreads}
            profile={profile}
            unreadTotal={threads.reduce((a, t) => a + t.unread, 0)}
            onQuery={setQuery}
            onTab={setTab}
            onSelect={selectThread}
            onCompose={() => setComposeOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            onMarkAllRead={async () => { await markAllThreadsRead(); setThreads((ts) => ts.map((t) => ({ ...t, unread: 0 }))); setSnack('All conversations marked as read'); }}
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
          draft={draft}
          setDraft={setDraft}
          replyTo={replyTo}
          attachment={attachment}
          typing={typing}
          receipt={receipt}
          onBack={() => setPane('list')}
          onToggleSearch={() => { setSearchOpen((o) => !o); setSearchQuery(''); setSearchResults(null); }}
          onSearchQuery={setSearchQuery}
          onOpenSettings={() => setSettingsOpen(true)}
          onSend={handleSend}
          onTyping={handleTyping}
          onReact={handleReact}
          onReply={(m) => setReplyTo({ author: m.author, text: m.text })}
          onCancelReply={() => setReplyTo(null)}
          onAttach={(f) => setAttachment(f)}
          onRemoveAttach={() => setAttachment(null)}
          onCompose={() => setComposeOpen(true)}
        />
      </AppShell>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
        onClose={() => setComposeOpen(false)}
        onStart={handleStartThread}
        onSearch={(term) => searchDirectory(term, token)}
        fullScreen={isMobile}
      />

      <Snackbar
        open={!!snack}
        message={snack}
        autoHideDuration={4000}
        onClose={() => setSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      />
    </>
  );
}
