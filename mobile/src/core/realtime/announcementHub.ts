import * as signalR from '@microsoft/signalr';
import { getGatewayUrl } from '@/core/config/serverConfig';
import { tokenStorage } from '@/core/storage/secureStorage';
import type { AnnouncementCommentItem, AnnouncementSummaryItem } from '@/core/types';

export interface CommentAddedEvent {
  announcementId: string;
  comment: AnnouncementCommentItem;
  commentCount: number;
}

export interface CommentDeletedEvent {
  announcementId: string;
  deletedCommentIds: string[];
  commentCount: number;
}

export interface LikeUpdatedEvent {
  announcementId: string;
  likeCount: number;
  actorUserId: string;
  isLiked: boolean;
}

export interface CommentsToggledEvent {
  announcementId: string;
  allowComments: boolean;
}

export interface AnnouncementStatsChangedEvent {
  announcementId: string;
  likeCount?: number;
  commentCount?: number;
  allowComments?: boolean;
  actorUserId?: string;
  isLiked?: boolean;
}

export type AnnouncementPublishedEvent = AnnouncementSummaryItem;

let connection: signalR.HubConnection | null = null;
let connectionGatewayUrl: string | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;
const activeRooms = new Set<string>();

function createConnection(gatewayUrl: string): signalR.HubConnection {
  const hubUrl = `${gatewayUrl}/hubs/announcements`;
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: async () => (await tokenStorage.getAccessToken()) || '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    // Pakai LogLevel.None agar kegagalan negosiasi saat offline/ganti Wi-Fi tidak memicu RedBox di Expo Go
    .configureLogging(signalR.LogLevel.None)
    .build();

  conn.onreconnected(async () => {
    for (const roomId of activeRooms) {
      try {
        await conn.invoke('JoinAnnouncementRoom', roomId);
      } catch {
        // Ignore room rejoin error
      }
    }
  });

  return conn;
}

export function getAnnouncementHubConnection(): signalR.HubConnection {
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

export async function ensureAnnouncementHubStarted(): Promise<signalR.HubConnection | null> {
  const token = await tokenStorage.getAccessToken();
  if (!token) return null;

  const conn = getAnnouncementHubConnection();
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

export async function joinAnnouncementRoom(announcementId: string): Promise<boolean> {
  activeRooms.add(announcementId);
  const conn = await ensureAnnouncementHubStarted();
  if (!conn || conn.state !== signalR.HubConnectionState.Connected) return false;
  try {
    await conn.invoke('JoinAnnouncementRoom', announcementId);
    return true;
  } catch {
    return false;
  }
}

export async function leaveAnnouncementRoom(announcementId: string): Promise<void> {
  activeRooms.delete(announcementId);
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) return;
  try {
    await connection.invoke('LeaveAnnouncementRoom', announcementId);
  } catch {
    // Ignore leave error
  }
}

export async function stopAnnouncementHub(): Promise<void> {
  activeRooms.clear();
  if (connection) {
    try {
      await connection.stop();
    } catch {
      // Ignore stop error
    }
    connection = null;
    connectionGatewayUrl = null;
  }
}

/**
 * Konversi HTML rich-text dari Announcement.Api menjadi teks berparagraf rapi untuk layar mobile.
 */
export function htmlToReadableText(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
