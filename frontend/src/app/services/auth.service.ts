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
      const stored = sessionStorage.getItem('wz_user');
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

  // UPDATED: Registration no longer automatically logs the user in
  register(data: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/auth/register`, data);
  }

  // NEW: Verify OTP and log the user in upon success
  verifyOtp(data: { email: string; otp: string }): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/auth/verify-otp`, data).pipe(
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
      sessionStorage.removeItem('wz_user');
    }
    this.currentUserSubject.next(null);
    this.router.navigate(['/auth']);
  }

  updateCurrentUser(user: User): void {
    const updated = { ...this.currentUser, ...user };
    this.setUser(updated as User);
  }

  private setUser(user: User): void {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('wz_user', JSON.stringify(user));
    }
    this.currentUserSubject.next(user);
  }
}