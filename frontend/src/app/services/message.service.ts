import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Message } from '../models/models';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  sendMessage(data: { receiver_id: string; content: string; pickup_id?: string }): Observable<Message> {
    return this.http.post<Message>(`${this.apiUrl}/messages`, data);
  }

  getConversations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/messages/conversations`);
  }

  getMessages(userId: string): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.apiUrl}/messages/${userId}`);
  }
}
