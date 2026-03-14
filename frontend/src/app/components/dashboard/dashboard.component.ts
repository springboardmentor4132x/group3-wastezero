import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { AdminService } from '../../services/admin.service';
import { PickupService } from '../../services/pickup.service';
import { User } from '../../models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  user: User | null = null;
  stats: any = {};
  recentPickups: any[] = [];
  loading = true;

  constructor(
    public auth: AuthService,
    private userService: UserService,
    private adminService: AdminService,
    private pickupService: PickupService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.user = this.auth.currentUser;
    this.loadStats();
    this.loadRecentPickups();
  }

  loadStats() {
    if (this.user?.role === 'admin') {
      this.adminService.getStats().subscribe({
        next: (data) => { this.stats = data; this.loading = false; this.cdr.markForCheck(); },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
    } else {
      this.userService.getStats().subscribe({
        next: (data) => { this.stats = data; this.loading = false; this.cdr.markForCheck(); },
        error: () => { this.loading = false; this.cdr.markForCheck(); },
      });
    }
  }

  loadRecentPickups() {
    if (this.user?.role === 'admin') {
      this.pickupService.getAllPickups().subscribe({
        next: (data) => { this.recentPickups = (data.pickups || data).slice(0, 5); this.cdr.markForCheck(); },
        error: () => {},
      });
    } else {
      this.pickupService.getMyPickups().subscribe({
        next: (data) => { this.recentPickups = data.slice(0, 5); this.cdr.markForCheck(); },
        error: () => {},
      });
    }
  }

  get wasteStatsArray(): { label: string; count: number; icon: string; css: string }[] {
    const ws = this.stats?.wasteStats;
    if (!ws) return [];
    return [
      { label: 'Plastic', count: ws.plastic || 0, icon: 'bi-droplet', css: 'waste-Plastic' },
      { label: 'Organic', count: ws.organic || 0, icon: 'bi-tree', css: 'waste-Organic' },
      { label: 'E-Waste', count: ws.eWaste || 0, icon: 'bi-phone', css: 'waste-E-Waste' },
      { label: 'Metal', count: ws.metal || 0, icon: 'bi-gear', css: 'waste-Metal' },
      { label: 'Paper', count: ws.paper || 0, icon: 'bi-file', css: 'waste-Paper' },
      { label: 'Glass', count: ws.glass || 0, icon: 'bi-cup', css: 'waste-Glass' },
    ].filter(w => w.count > 0);
  }

  getUserOf(pickup: any): string {
    return pickup.user_id?.name || pickup.user_id || 'Unknown';
  }

  getVolunteerOf(pickup: any): string {
    return pickup.volunteer_id?.name || 'Not assigned';
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}