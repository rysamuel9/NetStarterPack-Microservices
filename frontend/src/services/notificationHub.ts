import * as signalR from '@microsoft/signalr';
import type { NotificationItem } from '../types';

export interface NotificationReceivedEvent {
  notification: NotificationItem;
  unreadCount: number;
}

export interface UnreadCountUpdatedEvent {
  unreadCount: number;
}

let connection: signalR.HubConnection | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;

function createConnection(): signalR.HubConnection {
  return new signalR.HubConnectionBuilder()
    .withUrl('/hubs/notifications', {
      accessTokenFactory: () => localStorage.getItem('nsp_access_token') || '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();
}

export function getNotificationHubConnection(): signalR.HubConnection {
  if (!connection) {
    connection = createConnection();
  }
  return connection;
}

export async function ensureNotificationHubStarted(): Promise<signalR.HubConnection | null> {
  const token = localStorage.getItem('nsp_access_token');
  if (!token) return null;

  const conn = getNotificationHubConnection();
  if (conn.state === signalR.HubConnectionState.Connected) {
    return conn;
  }

  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    try {
      if (conn.state === signalR.HubConnectionState.Disconnected) {
        await conn.start();
      }
      return conn;
    } catch {
      return null;
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export async function stopNotificationHub(): Promise<void> {
  if (connection) {
    try {
      await connection.stop();
    } catch {
      // ignore
    }
    connection = null;
  }
}
