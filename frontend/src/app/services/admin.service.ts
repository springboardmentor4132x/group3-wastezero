import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/stats`);
  }

  getUsers(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/users`);
  }

  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/all-users`);
  }

  getUserActivity(params?: {
    page?: number;
    limit?: number;
    role?: 'user' | 'volunteer';
    search?: string;
  }): Observable<any> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.role) search.set('role', params.role);
    if (params?.search) search.set('search', params.search);
    const qs = search.toString();
    return this.http.get<any>(`${this.apiUrl}/admin/activity/users${qs ? `?${qs}` : ''}`);
  }

  getAdminOpportunities(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'open' | 'in-progress' | 'closed';
    includeDeleted?: boolean;
  }): Observable<any> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.search) search.set('search', params.search);
    if (params?.status) search.set('status', params.status);
    if (params?.includeDeleted) search.set('includeDeleted', 'true');
    const qs = search.toString();
    return this.http.get<any>(`${this.apiUrl}/admin/opportunities${qs ? `?${qs}` : ''}`);
  }

  updateAdminOpportunity(opportunityId: string, payload: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/admin/opportunities/${opportunityId}`, payload);
  }

  removeAdminOpportunity(opportunityId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/admin/opportunities/${opportunityId}`);
  }

  getPointsUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/points/users`);
  }

  getPointsUserHistory(userId: string, params?: {
    page?: number;
    limit?: number;
    search?: string;
    source?: string;
    from?: string;
    to?: string;
  }): Observable<any> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.search) search.set('search', params.search);
    if (params?.source) search.set('source', params.source);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    const qs = search.toString();
    return this.http.get<any>(`${this.apiUrl}/admin/points/users/${userId}/history${qs ? `?${qs}` : ''}`);
  }

  getPointsLogs(params?: {
    page?: number;
    limit?: number;
    search?: string;
    from?: string;
    to?: string;
    recentDays?: number;
  }): Observable<any> {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.search) search.set('search', params.search);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    if (params?.recentDays) search.set('recentDays', String(params.recentDays));
    const qs = search.toString();
    return this.http.get<any>(`${this.apiUrl}/admin/points/logs${qs ? `?${qs}` : ''}`);
  }

  adjustUserPoints(userId: string, delta: number, reason: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/points/users/${userId}/adjust`, { delta, reason });
  }

  toggleSuspend(userId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}/suspend`, {});
  }

  toggleBlock(userId: string, blocked?: boolean, reason?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}/block`, { blocked, reason });
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/users/${userId}`);
  }

  resetUserPassword(userId: string, payload: { newPassword: string; sendEmail?: boolean }): Observable<{ message: string; emailed?: boolean }> {
    return this.http.put<{ message: string; emailed?: boolean }>(`${this.apiUrl}/admin/users/${userId}/reset-password`, payload);
  }

  sendResetPasswordToken(userId: string): Observable<{ message: string; emailed?: boolean; resetUrl?: string | null }> {
    return this.http.post<{ message: string; emailed?: boolean; resetUrl?: string | null }>(`${this.apiUrl}/admin/users/${userId}/reset-password-token`, {});
  }

  broadcastAlert(payload: {
    title: string;
    message: string;
    targetRole?: 'all' | 'user' | 'volunteer' | 'admin';
    userIds?: string[];
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/admin/alerts/broadcast`, payload);
  }

  getSummaryReport(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/reports/summary`);
  }

  getOpportunityReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/opportunities`);
  }

  getApplicationReport(params?: { status?: string; search?: string }): Observable<any[]> {
    const search = new URLSearchParams();
    if (params?.status) search.set('status', params.status);
    if (params?.search) search.set('search', params.search);
    const qs = search.toString();
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/applications${qs ? `?${qs}` : ''}`);
  }

  getUserReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/users`);
  }

  getPickupReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/pickups`);
  }

  getIllegalDumpReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/illegal-dumps`);
  }

  getWasteReport(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/reports/waste`);
  }

  getVolunteerReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/volunteers`);
  }

  getLogs(params?: { limit?: number; action?: string; search?: string; from?: string; to?: string }): Observable<any[]> {
    const search = new URLSearchParams();
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.action) search.set('action', params.action);
    if (params?.search) search.set('search', params.search);
    if (params?.from) search.set('from', params.from);
    if (params?.to) search.set('to', params.to);
    const qs = search.toString();
    return this.http.get<any[]>(`${this.apiUrl}/admin/logs${qs ? `?${qs}` : ''}`);
  }
}
