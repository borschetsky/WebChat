import { useCallback, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { getProfile } from '@/services';
import type { ExternalAuthClient } from '@/features/auth/externalAuth';
import { selectUser, signedIn, signedOut, tokenRefreshed } from '@/features/auth/authSlice';

/** Renew this long before the token expires. Entra issues hour-long access tokens. */
const RENEW_BEFORE_MS = 5 * 60 * 1000;

/** Never re-arm faster than this, so a clock or provider fault cannot become a hot loop. */
const MIN_DELAY_MS = 15 * 1000;

export interface ExternalSession {
  /** True while an existing provider session is being turned into an app session on load. */
  resuming: boolean;
  /** Why the last external sign-in did not produce a session; null when it did, or none ran. */
  error: string | null;
  signIn: () => Promise<void>;
}

/**
 * Turns an external provider's session into the app's session, and keeps its token current.
 *
 * On load: if the provider already holds a session (a redirect just landed, or one is cached
 * from earlier), fetch a token silently and ask the API who that is. The API answer is what
 * provides the *local* user id - and it is also the request that creates the account on a
 * first sign-in, so its failure is the one worth explaining.
 *
 * While signed in externally: renew the token a few minutes before it expires. Everything
 * that sends a token reads it from the store at send time, so updating the store is enough.
 */
export function useExternalSession(
  client: ExternalAuthClient | null,
  onSignedIn: () => void,
): ExternalSession {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const [resuming, setResuming] = useState(client !== null && user === null);
  const [error, setError] = useState<string | null>(null);

  // Once, on mount. A user already in the store means a restored password session, which
  // the external provider has no say over.
  useEffect(() => {
    // `resuming` already started false in exactly this case - see its initial value.
    if (!client || user) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await client.resume();
        if (!token || cancelled) return;

        const res = await getProfile(token.token);
        if (cancelled) return;

        dispatch(signedIn({ ...token, id: res.data.id, provider: client.name }));
        onSignedIn();
      } catch (err) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 401
            ? `You signed in with ${client.label}, but WebChat refused the session. ` +
                'Ask an administrator - the account may be blocked, or the server may not ' +
                'be receiving your email address.'
            : `Signing in with ${client.label} did not complete. Try again.`,
        );
      } finally {
        if (!cancelled) setResuming(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Mount only: re-running when `user` changes would resume again after every sign-out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isExternal = !!client && !!user && user.provider === client.name;
  const expiresAt = user?.tokenExpirationTime ?? 0;

  useEffect(() => {
    if (!isExternal || !client) return;

    const delay = Math.max(MIN_DELAY_MS, expiresAt * 1000 - Date.now() - RENEW_BEFORE_MS);
    const timer = window.setTimeout(async () => {
      try {
        const token = await client.refresh();
        if (token) {
          dispatch(tokenRefreshed(token));
          return;
        }
      } catch {
        /* fall through: a session we cannot renew is a session that is over */
      }
      dispatch(signedOut());
    }, delay);

    return () => window.clearTimeout(timer);
  }, [isExternal, expiresAt, client, dispatch]);

  const signIn = useCallback(async () => {
    if (!client) return;
    setError(null);
    await client.signIn();
  }, [client]);

  return { resuming, error, signIn };
}
