import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { PickupService } from '../../services/pickup.service';
import { AuthService } from '../../services/auth.service';
import { Pickup } from '../../models/models';

@Component({
  selector: 'app-my-impact',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-impact.component.html',
})
export class MyImpactComponent implements OnInit {
  stats: any = {};
  pickups: Pickup[] = [];
  loading = true;

  wasteDetails = [
    { key: 'plastic', label: 'Plastic', icon: 'bi-droplet-fill', color: '#1565c0', bg: '#e3f2fd' },
    { key: 'organic', label: 'Organic', icon: 'bi-tree-fill', color: '#2e7d32', bg: '#e8f5e9' },
    { key: 'eWaste', label: 'E-Waste', icon: 'bi-phone-fill', color: '#c62828', bg: '#fce4ec' },
    { key: 'metal', label: 'Metal', icon: 'bi-gear-fill', color: '#6a1b9a', bg: '#f3e5f5' },
    { key: 'paper', label: 'Paper', icon: 'bi-file-text-fill', color: '#f57f17', bg: '#fff8e1' },
    { key: 'glass', label: 'Glass', icon: 'bi-cup-fill', color: '#006064', bg: '#e0f7fa' },
    { key: 'other', label: 'Other', icon: 'bi-recycle', color: '#424242', bg: '#f5f5f5' },
  ];

  constructor(
    public auth: AuthService,
    private userService: UserService,
    private pickupService: PickupService,
  private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.userService.getStats().subscribe({
      next: (data) => { this.stats = data; this.loading = false; this.cdr.markForCheck(); this.cdr.markForCheck(); },
      error: () => { this.loading = false; },
    });
    this.pickupService.getMyPickups().subscribe({
      next: (data) => { this.pickups = data; },
    });
  }

  get completedPickups(): Pickup[] {
    return this.pickups.filter(p => p.status === 'Completed');
  }

  get totalWaste(): number {
    const ws = this.stats?.wasteStats;
    if (!ws) return 0;
    return Object.values(ws).reduce((a: any, b: any) => a + b, 0) as number;
  }

  getWasteCount(key: string): number {
    return this.stats?.wasteStats?.[key] || 0;
  }

  get impactScore(): number {
    return (this.stats?.completed || 0) * 10 + this.totalWaste * 5;
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}