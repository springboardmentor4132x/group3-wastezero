import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SearchResult {
  _id: string;
  _type: 'opportunity' | 'pickup' | 'user';
  title?: string;
  name?: string;
  description?: string;
  location?: string;
  address?: string;
  status?: string;
  wasteType?: string;
  role?: string;
  createdAt?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  q: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private apiUrl = `${environment.apiUrl}/search`;

  /** Subject for debounced search input */
  private searchTerms = new Subject<string>();

  /** Observable of debounced search results */
  public searchResults$: Observable<SearchResponse>;

  constructor(private http: HttpClient) {
    this.searchResults$ = this.searchTerms.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      switchMap((term) => {
        if (!term || term.trim().length < 2) {
          return new Observable<SearchResponse>((sub) => {
            sub.next({ results: [], total: 0, q: '' });
            sub.complete();
          });
        }
        return this.search(term);
      }),
    );
  }

  /** Push a search term (debounced) */
  searchDebounced(term: string): void {
    this.searchTerms.next(term);
  }

  /** Direct search call */
  search(q: string, type?: string, limit?: number): Observable<SearchResponse> {
    let params = new HttpParams().set('q', q);
    if (type) params = params.set('type', type);
    if (limit) params = params.set('limit', limit);
    return this.http.get<SearchResponse>(this.apiUrl, { params });
  }
}
