import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Pickup } from '../models/models';

@Injectable({ providedIn: 'root' })
export class PickupService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  createPickup(data: any): Observable<Pickup> {
    return this.http.post<Pickup>(`${this.apiUrl}/pickups`, data);
  }

  getMyPickups(): Observable<Pickup[]> {
    return this.http.get<Pickup[]>(`${this.apiUrl}/pickups/my`);
  }

  getOpportunities(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pickups/opportunities`);
  }

  getAllPickups(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/pickups/all`);
  }

  getPickup(id: string): Observable<Pickup> {
    return this.http.get<Pickup>(`${this.apiUrl}/pickups/${id}`);
  }

  acceptPickup(id: string): Observable<Pickup> {
    return this.http.put<Pickup>(`${this.apiUrl}/pickups/${id}/accept`, {});
  }

  completePickup(id: string): Observable<Pickup> {
    return this.http.put<Pickup>(`${this.apiUrl}/pickups/${id}/complete`, {});
  }

  cancelPickup(id: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/pickups/${id}/cancel`, {});
  }

  deletePickup(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/pickups/${id}`);
  }
}
