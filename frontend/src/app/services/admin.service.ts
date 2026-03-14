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

  toggleSuspend(userId: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/admin/users/${userId}/suspend`, {});
  }

  deleteUser(userId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/admin/users/${userId}`);
  }

  getUserReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/users`);
  }

  getPickupReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/pickups`);
  }

  getWasteReport(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/admin/reports/waste`);
  }

  getVolunteerReport(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/reports/volunteers`);
  }

  getLogs(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/admin/logs`);
  }
}
