import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { User } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem('wz_user');
      if (stored) {
        try { this.currentUserSubject.next(JSON.parse(stored)); } catch {}
      }
    }
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get token(): string | null {
    return this.currentUser?.token || null;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  get userRole(): string {
    return this.currentUser?.role || '';
  }

  register(data: any): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/register`, data).pipe(
      tap(user => this.setUser(user))
    );
  }

  login(credentials: { username: string; password: string }): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/login`, credentials).pipe(
      tap(user => this.setUser(user))
    );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('wz_user');
    }
    this.currentUserSubject.next(null);
    this.router.navigate(['/auth']);
  }

  updateCurrentUser(user: User): void {
    const updated = { ...this.currentUser, ...user };
    this.setUser(updated as User);
  }

  requestPasswordReset(payload: { email: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/forgot-password`, payload);
  }

  resetPassword(payload: { email: string; otp: string; newPassword: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/reset-password`, payload);
  }

  private setUser(user: User): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('wz_user', JSON.stringify(user));
    }
    this.currentUserSubject.next(user);
  }
}
