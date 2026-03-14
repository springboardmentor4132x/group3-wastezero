import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-panel.component.html',
})
export class AdminPanelComponent implements OnInit {
  stats: any = {};
  loading = true;

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.adminService.getStats().subscribe({
      next: (data) => { this.stats = data; this.loading = false; this.cdr.markForCheck(); this.cdr.markForCheck(); },
      error: () => { this.loading = false; },
    });
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}