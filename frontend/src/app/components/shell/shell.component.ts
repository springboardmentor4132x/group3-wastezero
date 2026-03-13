import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { NotificationService, Notification } from '../../services/notification.service';
import { SearchService, SearchResult } from '../../services/search.service';
import { SocketService } from '../../services/socket.service';
import { User } from '../../models/models';
import { filter, Subscription } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit, OnDestroy {
  user: User | null = null;
  currentRoute = '';
  darkMode = false;
  sidebarOpen = false;

  // Profile dropdown
  showProfileDropdown = false;

  // Notifications
  notifications: Notification[] = [];
  unreadCount = 0;
  showNotifDropdown = false;

  // Search
  searchQuery = '';
  searchResults: SearchResult[] = [];
  showSearchResults = false;
  searchLoading = false;

  private subs: Subscription[] = [];

  constructor(
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private notifService: NotificationService,
    private searchService: SearchService,
    private socketService: SocketService,
  ) {}

  ngOnInit() {
    this.subs.push(
      this.auth.currentUser$.subscribe((u) => {
        this.user = u;
        if (u) {
          this.notifService.loadNotifications({ limit: 15 }).subscribe();
          this.notifService.loadUnreadCount().subscribe();
        }
        this.cdr.markForCheck();
      }),
    );

    this.subs.push(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe((e: any) => {
        this.currentRoute = e.urlAfterRedirects;
        this.showSearchResults = false;
        this.showNotifDropdown = false;
        this.sidebarOpen = false; // close drawer on navigation
        this.cdr.markForCheck();
      }),
    );
    this.currentRoute = this.router.url;

    // Subscribe to notification updates
    this.subs.push(
      this.notifService.notifications$.subscribe((n) => {
        this.notifications = n;
        this.cdr.markForCheck();
      }),
    );
    this.subs.push(
      this.notifService.unreadCount$.subscribe((c) => {
        this.unreadCount = c;
        this.cdr.markForCheck();
      }),
    );

    // Subscribe to search results
    this.subs.push(
      this.searchService.searchResults$.subscribe((res) => {
        this.searchResults = res.results;
        this.showSearchResults = res.results.length > 0 || res.q.length >= 2;
        this.searchLoading = false;
        this.cdr.markForCheck();
      }),
    );
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  get initials(): string {
    return this.user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  logout() {
    this.auth.logout();
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    this.cdr.markForCheck();
  }

  closeSidebar() {
    this.sidebarOpen = false;
    this.cdr.markForCheck();
  }

  isActive(route: string): boolean {
    return this.currentRoute.startsWith(route);
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
  }

  // ── Notifications ───────────────────────────────────────────────────────
  toggleNotifDropdown(event: Event) {
    event.stopPropagation();
    this.showNotifDropdown = !this.showNotifDropdown;
    this.showSearchResults = false;
    if (this.showNotifDropdown) {
      this.notifService.loadNotifications({ limit: 15 }).subscribe();
    }
    this.cdr.markForCheck();
  }

  markNotifRead(notif: Notification) {
    if (!notif.isRead) {
      this.notifService.markAsRead(notif._id).subscribe();
    }
    // Navigate based on type
    if (notif.ref_model === 'Application') {
      if (this.user?.role === 'admin') {
        this.router.navigate(['/admin/opportunities']);
      } else {
        this.router.navigate(['/my-applications']);
      }
    } else if (notif.ref_model === 'Opportunity') {
      this.router.navigate(['/opportunities']);
    } else if (notif.ref_model === 'Message') {
      this.router.navigate(['/messages']);
    }
    this.showNotifDropdown = false;
    this.cdr.markForCheck();
  }

  markAllRead() {
    this.notifService.markAllAsRead().subscribe();
  }

  // ── Search ──────────────────────────────────────────────────────────────
  onSearchInput() {
    this.showNotifDropdown = false;
    if (this.searchQuery.trim().length >= 2) {
      this.searchLoading = true;
      this.searchService.searchDebounced(this.searchQuery.trim());
    } else {
      this.searchResults = [];
      this.showSearchResults = false;
    }
    this.cdr.markForCheck();
  }

  navigateToResult(result: SearchResult) {
    switch (result._type) {
      case 'opportunity':
        if (this.user?.role === 'admin') {
          this.router.navigate(['/admin/opportunities']);
        } else {
          this.router.navigate(['/opportunities']);
        }
        break;
      case 'pickup':
        this.router.navigate(['/my-pickups']);
        break;
      case 'user':
        this.router.navigate(['/admin/users']);
        break;
    }
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchResults = false;
    this.cdr.markForCheck();
  }

  getResultIcon(type: string): string {
    switch (type) {
      case 'opportunity': return 'bi-briefcase';
      case 'pickup': return 'bi-truck';
      case 'user': return 'bi-person';
      default: return 'bi-search';
    }
  }

  getResultTitle(result: SearchResult): string {
    return result.title || result.name || 'Untitled';
  }

  getResultSubtitle(result: SearchResult): string {
    if (result._type === 'opportunity') return result.location || '';
    if (result._type === 'pickup') return result.address || '';
    if (result._type === 'user') return result.role || '';
    return '';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event) {
    this.showNotifDropdown = false;
    this.showSearchResults = false;
     this.showProfileDropdown = false;
    this.cdr.markForCheck();
  }

  toggleProfileDropdown(event: Event) {
    event.stopPropagation();
    this.showProfileDropdown = !this.showProfileDropdown;
    this.showNotifDropdown = false;
    this.showSearchResults = false;
    this.cdr.markForCheck();
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
    this.showProfileDropdown = false;
  }

  goToProfile() {
    this.router.navigate(['/profile']);
    this.showProfileDropdown = false;
  }
}
