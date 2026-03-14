import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/models';
import { filter } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  user: User | null = null;
  currentRoute = '';
  darkMode = false;

  constructor(public auth: AuthService, private router: Router) {}

  ngOnInit() {
    this.auth.currentUser$.subscribe(u => this.user = u);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.currentRoute = e.urlAfterRedirects;
    });
    this.currentRoute = this.router.url;
  }

  get initials(): string {
    return this.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  logout() {
    this.auth.logout();
  }

  isActive(route: string): boolean {
    return this.currentRoute.startsWith(route);
  }

  toggleDark() {
    this.darkMode = !this.darkMode;
    document.body.classList.toggle('dark-mode', this.darkMode);
  }
}
