import * as signalR from '@microsoft/signalr';
import { getGatewayUrl } from '@/core/config/serverConfig';
import { tokenStorage } from '@/core/storage/secureStorage';
import type { NotificationItem } from '@/core/types';

export interface NotificationReceivedEvent {
  notification: NotificationItem;
  unreadCount: number;
}

export interface UnreadCountUpdatedEvent {
  unreadCount: number;
}

let connection: signalR.HubConnection | null = null;
let connectionGatewayUrl: string | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;

function createConnection(gatewayUrl: string): signalR.HubConnection {
  const hubUrl = `${gatewayUrl}/hubs/notifications`;
  return new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: async () => (await tokenStorage.getAccessToken()) || '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.None)
    .build();
}

export function getNotificationHubConnection(): signalR.HubConnection {
  const currentUrl = getGatewayUrl();
  if (connection && connectionGatewayUrl !== currentUrl) {
    void connection.stop().catch(() => {});
    connection = null;
  }

  if (!connection) {
    connectionGatewayUrl = currentUrl;
    connection = createConnection(currentUrl);
  }
  return connection;
}

export async function ensureNotificationHubStarted(): Promise<signalR.HubConnection | null> {
  const token = await tokenStorage.getAccessToken();
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
    connectionGatewayUrl = null;
  }
}
