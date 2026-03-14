import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./components/landing/landing.component').then(m => m.LandingComponent),
  },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/auth/auth.component').then(m => m.AuthComponent),
  },
  {
    path: '',
    loadComponent: () => import('./components/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'schedule-pickup',
        canActivate: [authGuard],
        data: { roles: ['user'] },
        loadComponent: () => import('./components/schedule-pickup/schedule-pickup.component').then(m => m.SchedulePickupComponent),
      },
      {
        path: 'my-pickups',
        loadComponent: () => import('./components/my-pickups/my-pickups.component').then(m => m.MyPickupsComponent),
      },
      {
        path: 'opportunities',
        canActivate: [authGuard],
        data: { roles: ['volunteer', 'admin'] },
        loadComponent: () => import('./components/opportunities/opportunities.component').then(m => m.OpportunitiesComponent),
      },
      {
        path: 'messages',
        loadComponent: () => import('./components/messages/messages.component').then(m => m.MessagesComponent),
      },
      {
        path: 'profile',
        loadComponent: () => import('./components/profile/profile.component').then(m => m.ProfileComponent),
      },
      {
        path: 'my-impact',
        canActivate: [authGuard],
        data: { roles: ['user'] },
        loadComponent: () => import('./components/my-impact/my-impact.component').then(m => m.MyImpactComponent),
      },
      {
        path: 'admin/panel',
        canActivate: [authGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./components/admin/admin-panel/admin-panel.component').then(m => m.AdminPanelComponent),
      },
      {
        path: 'admin/users',
        canActivate: [authGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./components/admin/admin-users/admin-users.component').then(m => m.AdminUsersComponent),
      },
      {
        path: 'admin/pickups',
        canActivate: [authGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./components/admin/admin-pickups/admin-pickups.component').then(m => m.AdminPickupsComponent),
      },
      {
        path: 'admin/reports',
        canActivate: [authGuard],
        data: { roles: ['admin'] },
        loadComponent: () => import('./components/admin/admin-reports/admin-reports.component').then(m => m.AdminReportsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '/dashboard' },
];
