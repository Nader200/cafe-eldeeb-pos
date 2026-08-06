/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';

export interface LogEvent {
  id: string;
  time: string;
  title: string;
  type: 'PUSH_SUCCESS' | 'PUSH_FAILED' | 'SNAPSHOT' | 'ERROR' | 'UI_REFRESH' | 'ACTION' | 'INFO';
  details?: string;
  key?: string;
  path?: string;
  deviceId?: string;
}

export interface PushInfo {
  time: string;
  key: string;
  path: string;
  sizeBytes: number;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  error?: string;
}

export interface SnapshotInfo {
  time: string;
  collection: string;
  docId: string;
  changeType: string;
  deviceId: string;
  sizeBytes: number;
}

type DiagnosticsListener = () => void;

class SyncDiagnosticLogger {
  private events: LogEvent[] = [];
  private lastPush: PushInfo | null = null;
  private lastSnapshot: SnapshotInfo | null = null;
  private docsReceivedCount: number = 0;
  private listeners: DiagnosticsListener[] = [];

  constructor() {
    try {
      const savedPush = safeStorage.getItem('cafe_last_push_info');
      if (savedPush) {
        this.lastPush = JSON.parse(savedPush);
      }
    } catch (e) {
      // Ignore parse error
    }

    this.addEvent({
      type: 'INFO',
      title: 'مركز التشخيص متصل ومستعد',
      details: 'Sync Diagnostic Logger Initialized'
    });
  }

  public subscribe(listener: DiagnosticsListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  public addEvent(event: Omit<LogEvent, 'id' | 'time'> & { time?: string }) {
    const timeStr = event.time || new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const newLog: LogEvent = {
      id: Math.random().toString(36).substring(2, 9) + '_' + Date.now(),
      time: timeStr,
      title: event.title,
      type: event.type,
      details: event.details,
      key: event.key,
      path: event.path,
      deviceId: event.deviceId
    };

    this.events.unshift(newLog);
    if (this.events.length > 100) {
      this.events = this.events.slice(0, 100);
    }
    this.notify();
  }

  public recordPushStart(key: string, path: string) {
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    this.lastPush = {
      time: timeStr,
      key,
      path,
      sizeBytes: 0,
      status: 'PENDING'
    };

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
    } catch (e) {}

    this.addEvent({
      time: timeStr,
      type: 'INFO',
      title: 'PUSH START',
      key,
      path,
      details: `Key: ${key} | Target: ${path}`
    });
  }

  public recordPushSuccess(key: string, path: string, data: any) {
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let sizeBytes = 0;
    try {
      sizeBytes = new Blob([JSON.stringify(data || {})]).size;
    } catch (e) {
      sizeBytes = 0;
    }

    this.lastPush = {
      time: timeStr,
      key,
      path,
      sizeBytes,
      status: 'SUCCESS'
    };

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
    } catch (e) {}

    this.addEvent({
      time: timeStr,
      type: 'PUSH_SUCCESS',
      title: 'PUSH SUCCESS',
      key,
      path,
      details: `Key: ${key} | Path: ${path} | Size: ${(sizeBytes / 1024).toFixed(2)} KB`
    });
  }

  public recordPushFailure(key: string, path: string, errorMsg: string) {
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    this.lastPush = {
      time: timeStr,
      key,
      path,
      sizeBytes: 0,
      status: 'FAILED',
      error: errorMsg
    };

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
    } catch (e) {}

    this.addEvent({
      time: timeStr,
      type: 'PUSH_FAILED',
      title: 'PUSH FAILED',
      key,
      path,
      details: `Key: ${key} | Path: ${path} | Reason: ${errorMsg}`
    });
  }

  public recordSnapshot(docId: string, collectionPath: string, changeType: string, deviceId: string, data: any) {
    const timeStr = new Date().toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let sizeBytes = 0;
    try {
      sizeBytes = new Blob([JSON.stringify(data || {})]).size;
    } catch (e) {
      sizeBytes = 0;
    }

    this.docsReceivedCount++;

    this.lastSnapshot = {
      time: timeStr,
      collection: collectionPath,
      docId,
      changeType,
      deviceId: deviceId || 'unknown',
      sizeBytes
    };

    this.addEvent({
      time: timeStr,
      type: 'SNAPSHOT',
      title: `SNAPSHOT ${docId} RECEIVED`,
      key: docId,
      path: collectionPath,
      deviceId: deviceId || 'unknown',
      details: `Type: ${changeType} | From Device: ${deviceId || 'unknown'} | Size: ${(sizeBytes / 1024).toFixed(2)} KB`
    });
  }

  public recordError(title: string, errorMsg: string) {
    this.addEvent({
      type: 'ERROR',
      title: `ERROR: ${title}`,
      details: errorMsg
    });
  }

  public recordUIRefresh(viewName: string) {
    this.addEvent({
      type: 'UI_REFRESH',
      title: `UI REFRESH ${viewName}`,
      details: `Triggered UI update for ${viewName}`
    });
  }

  public getEvents(): LogEvent[] {
    return [...this.events];
  }

  public getLastPush(): PushInfo | null {
    return this.lastPush;
  }

  public getLastSnapshot(): SnapshotInfo | null {
    return this.lastSnapshot;
  }

  public getDocsReceivedCount(): number {
    return this.docsReceivedCount;
  }

  public clearLogs() {
    this.events = [];
    this.addEvent({
      type: 'INFO',
      title: 'تم مسح سجلات التشخيص',
      details: 'Logs cleared by user'
    });
  }
}

export const syncDiagnosticLogger = new SyncDiagnosticLogger();
