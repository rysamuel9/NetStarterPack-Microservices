import * as signalR from '@microsoft/signalr';
import type { LivePositionEvent, TrackingSummaryItem } from '../types';

export interface AssignmentStatusChangedEvent {
  summary: TrackingSummaryItem;
  action: string;
  note?: string | null;
  timestamp: string;
}

let connection: signalR.HubConnection | null = null;
let startPromise: Promise<signalR.HubConnection | null> | null = null;
let inCommandCenter = false;
const activeAssignmentRooms = new Set<string>();

function createConnection(): signalR.HubConnection {
  const conn = new signalR.HubConnectionBuilder()
    .withUrl('/hubs/tracking', {
      accessTokenFactory: () => localStorage.getItem('nsp_access_token') || '',
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

  conn.onreconnected(async () => {
    if (inCommandCenter) {
      try {
        await conn.invoke('JoinCommandCenter');
      } catch {
        // ignore
      }
    }
    for (const id of activeAssignmentRooms) {
      try {
        await conn.invoke('JoinAssignmentRoom', id);
      } catch {
        // ignore
      }
    }
  });

  return conn;
}

export function getTrackingHubConnection(): signalR.HubConnection {
  if (!connection) {
    connection = createConnection();
  }
  return connection;
}

export async function ensureTrackingHubStarted(): Promise<signalR.HubConnection | null> {
  const token = localStorage.getItem('nsp_access_token');
  if (!token) return null;

  const conn = getTrackingHubConnection();
  if (conn.state === signalR.HubConnectionState.Connected) {
    return conn;
  }

  if (startPromise) return startPromise;

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

export async function joinTrackingCommandCenter(): Promise<boolean> {
  inCommandCenter = true;
  const conn = await ensureTrackingHubStarted();
  if (!conn || conn.state !== signalR.HubConnectionState.Connected) return false;
  try {
    await conn.invoke('JoinCommandCenter');
    return true;
  } catch {
    return false;
  }
}

export async function leaveTrackingCommandCenter(): Promise<void> {
  inCommandCenter = false;
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) return;
  try {
    await connection.invoke('LeaveCommandCenter');
  } catch {
    // ignore
  }
}

export async function joinTrackingAssignmentRoom(assignmentId: string): Promise<boolean> {
  activeAssignmentRooms.add(assignmentId);
  const conn = await ensureTrackingHubStarted();
  if (!conn || conn.state !== signalR.HubConnectionState.Connected) return false;
  try {
    await conn.invoke('JoinAssignmentRoom', assignmentId);
    return true;
  } catch {
    return false;
  }
}

export async function leaveTrackingAssignmentRoom(assignmentId: string): Promise<void> {
  activeAssignmentRooms.delete(assignmentId);
  if (!connection || connection.state !== signalR.HubConnectionState.Connected) return;
  try {
    await connection.invoke('LeaveAssignmentRoom', assignmentId);
  } catch {
    // ignore
  }
}

export type TrackingLocationHandler = (pos: LivePositionEvent) => void;
