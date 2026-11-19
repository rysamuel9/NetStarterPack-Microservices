import * as signalR from '@microsoft/signalr';
import type { AnnouncementCommentItem, AnnouncementSummaryItem } from '../types';

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

let connection: signalR.HubConnection | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;
const activeRooms = new Set<string>();

function createConnection(): signalR.HubConnection {
  const hubUrl = '/hubs/announcements';
  const conn = new signalR.HubConnectionBuilder()
    .withUrl(hubUrl, {
      accessTokenFactory: () => localStorage.getItem('nsp_access_token') || '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  conn.onreconnected(async () => {
    for (const roomId of activeRooms) {
      try {
        await conn.invoke('JoinAnnouncementRoom', roomId);
      } catch {
        // ignore
      }
    }
  });

  return conn;
}

export function getAnnouncementHubConnection(): signalR.HubConnection {
  if (!connection) {
    connection = createConnection();
  }
  return connection;
}

export async function ensureAnnouncementHubStarted(): Promise<signalR.HubConnection | null> {
  const token = localStorage.getItem('nsp_access_token');
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
    // ignore
  }
}

export async function stopAnnouncementHub(): Promise<void> {
  activeRooms.clear();
  if (connection) {
    try {
      await connection.stop();
    } catch {
      // ignore
    }
    connection = null;
  }
}

export type AnnouncementPublishedHandler = (summary: AnnouncementSummaryItem) => void;
