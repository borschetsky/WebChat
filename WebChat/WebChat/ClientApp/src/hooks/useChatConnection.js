import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';
import Config from '../config';

/**
 * Owns the SignalR hub connection.
 *
 * Improvements over the class-component version this replaces:
 *  - handlers are removed on unmount; the old code registered them and never cleaned up,
 *    so a remount stacked duplicate subscriptions and every message fired repeatedly
 *  - automatic reconnect, instead of a commented-out manual retry loop
 *  - connection status is exposed so the UI can show it
 *
 * Handlers are held in a ref so changing them does not tear down and rebuild the socket.
 */
export function useChatConnection(token, handlers) {
  const [status, setStatus] = useState('connecting');
  const connectionRef = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return undefined;

    // Config.network.api is relative by default, so this resolves same-origin and works
    // both behind the Vite proxy and when served by the ASP.NET host.
    const url = `${Config.network.api}${Config.network.wss}`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(url, { accessTokenFactory: () => token })
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    // Every hub event, dispatched to whatever the caller currently has registered.
    const events = [
      'ReciveMessage',
      'ReviceThread',
      'ReciveTypingStatus',
      'ReciveStopTypingStatus',
      'ReciveConnectedStatus',
      'ReciveDisconnectedStatus',
      'ReciveAvatar',
      'ReviceUpdatedOpponentProfile',
    ];

    events.forEach((name) => {
      connection.on(name, (...args) => handlersRef.current?.[name]?.(...args));
    });

    connection.onreconnecting(() => setStatus('reconnecting'));
    connection.onreconnected(() => setStatus('connected'));
    connection.onclose(() => setStatus('disconnected'));

    let cancelled = false;
    connection
      .start()
      .then(() => { if (!cancelled) setStatus('connected'); })
      .catch(() => { if (!cancelled) setStatus('failed'); });

    return () => {
      cancelled = true;
      events.forEach((name) => connection.off(name));
      connection.stop();
      connectionRef.current = null;
    };
  }, [token]);

  /** Hub methods are fire-and-forget; a dropped typing notification is not worth surfacing. */
  const invoke = (method, ...args) => {
    const c = connectionRef.current;
    if (c && c.state === signalR.HubConnectionState.Connected) {
      c.invoke(method, ...args).catch(() => {});
    }
  };

  return { status, invoke, connection: connectionRef };
}

export default useChatConnection;
