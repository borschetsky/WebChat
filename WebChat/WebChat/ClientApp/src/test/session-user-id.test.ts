import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeStore } from '@/app/store';
import { signedIn, signedOut } from '@/features/auth/authSlice';
import { currentUserId } from '@/services/adapters';
import { sendMessage } from '@/services/chat-service';

/**
 * The signed-in user's id, as the services layer sees it, must come from the session in the
 * store - not from localStorage.
 *
 * It used to be read from localStorage 'user-data', which only a *password* session is ever
 * written to: an external (Entra) session is deliberately kept out of it, because MSAL's own
 * cache restores that session with a current token. So for every Microsoft user the id was
 * null - `POST api/hey/send` carried `senderId: null`, failed `[Required]` with a 400, and
 * the message showed "Not sent"; every "is this mine?" decision in the adapters was wrong.
 */
const sendMessageToApi = vi.fn();
vi.mock('@/services/api-service', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendMessageToApi: (...args: unknown[]) => sendMessageToApi(...args),
}));

const externalSession = {
  token: 'entra-token',
  tokenExpirationTime: 9999999999,
  id: 'u-ext',
  provider: 'entra',
};

describe('the session user id seen by the services layer', () => {
  beforeEach(() => {
    localStorage.clear();
    sendMessageToApi.mockReset();
  });

  it('is the external session id, although nothing is written to localStorage', () => {
    const store = makeStore({ user: null, busy: false });
    store.dispatch(signedIn(externalSession));

    expect(localStorage.getItem('user-data')).toBeNull();
    expect(currentUserId()).toBe('u-ext');
  });

  it('follows sign-out', () => {
    const store = makeStore({ user: null, busy: false });
    store.dispatch(signedIn(externalSession));
    store.dispatch(signedOut());

    expect(currentUserId()).toBeNull();
  });

  it('is what an external user sends as senderId, so the message is not refused', async () => {
    const store = makeStore({ user: null, busy: false });
    store.dispatch(signedIn(externalSession));
    sendMessageToApi.mockResolvedValue({
      data: {
        id: 'm1',
        senderId: 'u-ext',
        text: 'hi',
        threadId: 't1',
        username: 'ms.test',
        time: new Date().toISOString(),
        date: new Date().toISOString(),
      },
    });

    const message = await sendMessage({ threadId: 't1', text: 'hi' }, 'entra-token');

    expect(sendMessageToApi).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'u-ext', threadId: 't1', text: 'hi' }),
      'entra-token',
    );
    expect(message.own).toBe(true);
  });
});
