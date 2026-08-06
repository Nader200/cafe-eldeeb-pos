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

let pushSequence = 0;

class SyncDiagnosticLogger {
  public readonly instanceId: string = Math.random().toString(36).substring(2, 9);
  private activePushSeqMap: Map<string, number> = new Map();
  private events: LogEvent[] = [];
  private lastPush: PushInfo | null = null;
  private lastSuccessfulPush: PushInfo | null = null;
  private lastSnapshot: SnapshotInfo | null = null;
  private docsReceivedCount: number = 0;
  private listeners: DiagnosticsListener[] = [];

  constructor() {
    console.log(`[SyncDiagnosticLogger CREATED] instanceId: ${this.instanceId}`);
    try {
      const savedPush = safeStorage.getItem('cafe_last_push_info');
      if (savedPush) {
        this.lastPush = JSON.parse(savedPush);
      }
      const savedSuccessPush = safeStorage.getItem('cafe_last_successful_push_info');
      if (savedSuccessPush) {
        this.lastSuccessfulPush = JSON.parse(savedSuccessPush);
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
    const id = ++pushSequence;
    this.activePushSeqMap.set(key, id);
    console.log(`[PUSH ${id}] START`, key);
    console.trace(`[LOGGER instance:${this.instanceId}] [recordPushStart STACK] Push #${id} | key: ${key}`);
    console.log(`[LOGGER instance:${this.instanceId}] recordPushStart BEFORE this.lastPush:`, this.lastPush);
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

    console.log(`[LOGGER instance:${this.instanceId}] recordPushStart AFTER this.lastPush:`, this.lastPush);
    console.log(`[LOGGER instance:${this.instanceId}] [LAST PUSH STATE]:`, this.lastPush);

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
    } catch (e) {}

    console.log(`[LOGGER instance:${this.instanceId}] saved to localStorage:`, localStorage.getItem("cafe_last_push_info"));

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
    const id = this.activePushSeqMap.get(key) || pushSequence;
    console.log(`[PUSH ${id}] SUCCESS`, key);
    console.log(`[LOGGER instance:${this.instanceId}] recordPushSuccess BEFORE this.lastPush:`, this.lastPush);
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

    this.lastSuccessfulPush = {
      time: timeStr,
      key,
      path,
      sizeBytes,
      status: 'SUCCESS'
    };

    console.log(`[LOGGER instance:${this.instanceId}] recordPushSuccess AFTER this.lastPush:`, this.lastPush);
    console.log(`[LOGGER instance:${this.instanceId}] [LAST PUSH STATE]:`, this.lastPush);

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
      safeStorage.setItem('cafe_last_successful_push_info', JSON.stringify(this.lastSuccessfulPush));
    } catch (e) {}

    console.log(`[LOGGER instance:${this.instanceId}] saved to localStorage:`, localStorage.getItem("cafe_last_push_info"));

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
    const id = this.activePushSeqMap.get(key) || pushSequence;
    console.log(`[PUSH ${id}] FAILURE`, key);
    console.log(`[LOGGER instance:${this.instanceId}] recordPushFailure BEFORE this.lastPush:`, this.lastPush);
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

    console.log(`[LOGGER instance:${this.instanceId}] recordPushFailure AFTER this.lastPush:`, this.lastPush);
    console.log(`[LOGGER instance:${this.instanceId}] [LAST PUSH STATE]:`, this.lastPush);

    try {
      safeStorage.setItem('cafe_last_push_info', JSON.stringify(this.lastPush));
    } catch (e) {}

    console.log(`[LOGGER instance:${this.instanceId}] saved to localStorage:`, localStorage.getItem("cafe_last_push_info"));

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
    console.log(`[LOGGER instance:${this.instanceId}] getLastPush() CALLED ->`, this.lastPush);
    return this.lastPush;
  }

  public getLastSuccessfulPush(): PushInfo | null {
    return this.lastSuccessfulPush;
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
