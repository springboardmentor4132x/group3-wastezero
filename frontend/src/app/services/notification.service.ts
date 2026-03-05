import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { SocketService } from './socket.service';

export interface Notification {
  _id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  ref_id?: string;
  ref_model?: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: Notification[];
  total: number;
  page: number;
  pages: number;
  unreadCount: number;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private apiUrl = `${environment.apiUrl}/notifications`;

  /** Live unread count — subscribe in shell for badge */
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  /** Live notifications list — latest first */
  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  constructor(
    private http: HttpClient,
    private socketService: SocketService,
  ) {
    // Listen for real-time notifications
    this.socketService.on<Notification>('notification:new').subscribe((notif) => {
      const current = this.notificationsSubject.value;
      this.notificationsSubject.next([notif, ...current].slice(0, 50));
      this.unreadCountSubject.next(this.unreadCountSubject.value + 1);
    });
  }

  /** Load notifications from API */
  loadNotifications(params?: { page?: number; limit?: number; unread?: boolean }): Observable<NotificationPage> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.unread) httpParams = httpParams.set('unread', 'true');

    return this.http.get<NotificationPage>(this.apiUrl, { params: httpParams }).pipe(
      tap((res) => {
        this.notificationsSubject.next(res.notifications);
        this.unreadCountSubject.next(res.unreadCount);
      }),
    );
  }

  /** Get unread count */
  loadUnreadCount(): Observable<{ unreadCount: number }> {
    return this.http.get<{ unreadCount: number }>(`${this.apiUrl}/unread-count`).pipe(
      tap((res) => this.unreadCountSubject.next(res.unreadCount)),
    );
  }

  /** Mark single notification as read */
  markAsRead(id: string): Observable<Notification> {
    return this.http.put<Notification>(`${this.apiUrl}/${id}/read`, {}).pipe(
      tap(() => {
        const current = this.notificationsSubject.value.map((n) =>
          n._id === id ? { ...n, isRead: true } : n,
        );
        this.notificationsSubject.next(current);
        const unread = this.unreadCountSubject.value;
        if (unread > 0) this.unreadCountSubject.next(unread - 1);
      }),
    );
  }

  /** Mark all as read */
  markAllAsRead(): Observable<any> {
    return this.http.put(`${this.apiUrl}/read-all`, {}).pipe(
      tap(() => {
        const current = this.notificationsSubject.value.map((n) => ({ ...n, isRead: true }));
        this.notificationsSubject.next(current);
        this.unreadCountSubject.next(0);
      }),
    );
  }
}
