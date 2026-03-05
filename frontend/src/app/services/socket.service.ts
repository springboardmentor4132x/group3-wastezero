import { Injectable, PLATFORM_ID, Inject, OnDestroy, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Subject, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { io, Socket } from 'socket.io-client';

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
    if (this.socket?.connected) return;

    const wsUrl = 'http://localhost:5000';

    this.socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('⚡ Socket connected');
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('⚡ Socket disconnected');
    });

    this.socket.on('connect_error', (err: Error) => {
      console.error('Socket connection error:', err.message);
    });

    // Re-bind any existing event listeners
    this.eventSubjects.forEach((_, event) => {
      this.bindEvent(event);
    });
  }

  /** Disconnect from Socket.IO */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
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
}
