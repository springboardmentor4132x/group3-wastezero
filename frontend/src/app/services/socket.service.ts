import { Injectable, PLATFORM_ID, Inject, OnDestroy, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';

let sharedSocket: Socket | null = null;

/**
 * Centralised Socket.IO service.
 * Connects on login, disconnects on logout.
 * Components subscribe to typed events via on<T>(eventName).
 */
@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private eventSubjects = new Map<string, Subject<any>>();
  private connected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private socketDisabledNoticeShown = false;
  private activeToken: string | null = null;

  constructor(
    private auth: AuthService,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {
    if (isPlatformBrowser(this.platformId)) {
      // Auto-connect when user logs in / is already logged in
      this.auth.currentUser$.subscribe((user) => {
        if (user?.token) {
          this.connect(user.token);
        } else {
          this.disconnect();
        }
      });
    }
  }

  /** Connect to Socket.IO server with JWT */
  connect(token: string): void {
    if (!environment.socketEnabled) {
      if (!this.socketDisabledNoticeShown) {
        console.info('Socket.IO disabled for this deployment; using HTTP polling fallback only.');
        this.socketDisabledNoticeShown = true;
      }
      return;
    }

    // Guard repeated emissions from auth state updates.
    if (
      this.socket &&
      this.activeToken === token &&
      (this.socket.connected || this.socket.active)
    ) {
      return;
    }

    const wsUrl = environment.socketUrl;
    if (!sharedSocket) {
      sharedSocket = io(wsUrl, {
        autoConnect: false,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
      });
    }

    this.socket = sharedSocket;
    this.socket.auth = { token };
  this.activeToken = token;

    this.socket.off('connect');
    this.socket.off('disconnect');
    this.socket.off('connect_error');

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('⚡ Socket connected');
      this.startHeartbeat();
    });

    this.socket.on('disconnect', (reason) => {
      this.connected = false;
      this.stopHeartbeat();
      console.log('⚡ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err.message);
    });

    // Re-bind any existing event listeners
    this.eventSubjects.forEach((_, event) => {
      this.bindEvent(event);
    });

    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  /** Disconnect from Socket.IO */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
    this.activeToken = null;
    this.stopHeartbeat();
  }

  /** Listen to a specific event, returns Observable<T> */
  on<T = any>(event: string): Observable<T> {
    if (!this.eventSubjects.has(event)) {
      this.eventSubjects.set(event, new Subject<T>());
      this.bindEvent(event);
    }
    return this.eventSubjects.get(event)!.asObservable();
  }

  /** Emit an event to the server */
  emit(event: string, data?: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  /** Join an opportunity room for targeted updates */
  joinOpportunity(oppId: string): void {
    this.emit('opportunity:join', oppId);
  }

  /** Leave an opportunity room */
  leaveOpportunity(oppId: string): void {
    this.emit('opportunity:leave', oppId);
  }

  get isConnected(): boolean {
    return this.connected;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.eventSubjects.forEach((s) => s.complete());
    this.eventSubjects.clear();
  }

  private bindEvent(event: string): void {
    if (!this.socket) return;
    // Remove existing listener if any
    this.socket.off(event);
    this.socket.on(event, (data: any) => {
      // Run inside NgZone to trigger change detection
      this.zone.run(() => {
        this.eventSubjects.get(event)?.next(data);
      });
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('client:heartbeat', { at: Date.now() });
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
