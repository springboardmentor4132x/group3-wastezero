import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Application, ApplicationPage } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ApplicationService {
  private apiUrl = `${environment.apiUrl}/applications`;

  constructor(private http: HttpClient) {}

  /** Volunteer applies to an opportunity */
  apply(opportunityId: string): Observable<Application> {
    return this.http.post<Application>(this.apiUrl, { opportunity_id: opportunityId });
  }

  /** Get volunteer's own applications */
  getMyApplications(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Observable<ApplicationPage> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    return this.http.get<ApplicationPage>(`${this.apiUrl}/my`, { params: httpParams });
  }

  /** Admin lists applications for a specific opportunity */
  listForOpportunity(
    opportunityId: string,
    params?: { page?: number; limit?: number; status?: string }
  ): Observable<ApplicationPage> {
    let httpParams = new HttpParams();
    if (params?.page) httpParams = httpParams.set('page', params.page);
    if (params?.limit) httpParams = httpParams.set('limit', params.limit);
    if (params?.status) httpParams = httpParams.set('status', params.status);
    return this.http.get<ApplicationPage>(
      `${this.apiUrl}/opportunity/${opportunityId}`,
      { params: httpParams }
    );
  }

  /** Admin accepts or rejects an application */
  decide(applicationId: string, decision: 'accepted' | 'rejected'): Observable<Application> {
    return this.http.put<Application>(
      `${this.apiUrl}/${applicationId}/decide`,
      { decision }
    );
  }
}
