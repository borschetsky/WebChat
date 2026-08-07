import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { ThemeModeProvider } from '@/theme/ThemeModeProvider';
import { makeStore } from '@/app/store';
import ConversationPane from '@/features/messages/ConversationPane';
import type { Message, Thread } from '@/types/models';

/**
 * Counts renders of a leaf inside MessageRow. If MessageRow re-renders, this does too, so
 * it is a faithful probe of whether React.memo is actually engaging - which it was not
 * before this phase, because ChatApp passed fresh arrow functions on every render.
 */
let bodyRenders = 0;
vi.mock('@/features/messages/components/MessageBody', () => ({
  default: ({ text }: { text: string }) => {
    bodyRenders += 1;
    return <span>{text}</span>;
  },
}));

vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Connected: 'Connected' },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return {
        state: 'Disconnected',
        on() {},
        off() {},
        onreconnecting() {},
        onreconnected() {},
        onclose() {},
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        invoke: () => Promise.resolve(),
      };
    }
  },
}));

const thread: Thread = {
  id: 't1',
  opponentId: 'u2',
  name: 'Maya Rodriguez',
  avatarFileName: null,
  color: '#1976d2',
  presence: 'online',
  isTyping: false,
  preview: 'hi',
  time: '10:00',
  lastMessageAt: null,
  group: false,
  unread: 0,
  members: [],
};

const messages: Message[] = Array.from({ length: 20 }, (_, i) => ({
  id: `m${i}`,
  threadId: 't1',
  authorId: 'u2',
  author: 'Maya Rodriguez',
  color: '#1976d2',
  own: false,
  text: `message ${i}`,
  time: '10:00',
  sentAt: `2026-08-03T10:0${i % 10}:00`,
  reactions: [],
  quote: null,
  attachment: null,
}));

// Stable identities, exactly as ChatApp now provides via useCallback.
const noop = () => {};
const stableProps = {
  thread,
  messages,
  loading: false,
  density: 'comfortable' as const,
  isMobile: false,
  searchOpen: false,
  searchQuery: '',
  searchCount: 0,
  totalCount: messages.length,
  typing: false,
  receipt: null,
  onBack: noop,
  onToggleSearch: noop,
  onSearchQuery: noop,
  onOpenSettings: noop,
  onSend: noop,
  onTyping: noop,
  onReact: noop,
  onReply: noop,
  onRetry: noop,
  onCompose: noop,
};

const renderPane = () => {
  const store = makeStore({
    user: { token: 'jwt', tokenExpirationTime: 1, id: 'me' },
    busy: false,
  });
  return render(
    <Provider store={store}>
      <ThemeModeProvider>
        <ConversationPane {...stableProps} />
      </ThemeModeProvider>
    </Provider>,
  );
};

describe('typing does not re-render the message list', () => {
  beforeEach(() => {
    bodyRenders = 0;
    localStorage.clear();
  });

  it('renders each message once on mount', () => {
    renderPane();
    expect(bodyRenders).toBe(messages.length);
  });

  it('leaves every message row untouched while the composer is typed into', () => {
    renderPane();
    const afterMount = bodyRenders;

    const input = screen.getByLabelText('Message Maya');
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: 'he' } });
    fireEvent.change(input, { target: { value: 'hel' } });
    fireEvent.change(input, { target: { value: 'hell' } });
    fireEvent.change(input, { target: { value: 'hello' } });

    // The draft lives in composerSlice and only Composer subscribes to it, so five
    // keystrokes must produce zero additional message renders. Before this refactor each
    // keystroke re-rendered all 20 rows.
    expect(bodyRenders).toBe(afterMount);
    expect(input).toHaveValue('hello');
  });
});
