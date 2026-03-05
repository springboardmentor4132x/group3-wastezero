import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Opportunity, OpportunityPage } from '../models/models';

@Injectable({ providedIn: 'root' })
export class OpportunityService {
  private apiUrl = `${environment.apiUrl}/opportunities`;

  constructor(private http: HttpClient) {}

  /** Create a new opportunity (admin only) */
  create(data: {
    title: string;
    description: string;
    requiredSkills: string[];
    duration: string;
    location: string;
  }): Observable<Opportunity> {
    return this.http.post<Opportunity>(this.apiUrl, data);
  }

  /** List opportunities with optional filters (role-aware on backend) */
  list(params?: {
    page?: number;
    limit?: number;
    location?: string;
    skills?: string;
    status?: string;
    mine?: boolean;
    includeDeleted?: boolean;
  }): Observable<OpportunityPage> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.location) httpParams = httpParams.set('location', params.location);
    if (params?.skills) httpParams = httpParams.set('skills', params.skills);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    if (params?.mine) httpParams = httpParams.set('mine', 'true');
    if (params?.includeDeleted) httpParams = httpParams.set('includeDeleted', 'true');
    return this.http.get<OpportunityPage>(this.apiUrl, { params: httpParams });
  }

  /** Get single opportunity by ID */
  get(id: string): Observable<Opportunity> {
    return this.http.get<Opportunity>(`${this.apiUrl}/${id}`);
  }

  /** Update opportunity (admin owner only) */
  update(id: string, data: Partial<Opportunity>): Observable<Opportunity> {
    return this.http.put<Opportunity>(`${this.apiUrl}/${id}`, data);
  }

  /** Soft-delete opportunity (admin owner only) */
  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
