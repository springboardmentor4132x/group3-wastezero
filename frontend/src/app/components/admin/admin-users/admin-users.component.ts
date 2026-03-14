import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.component.html',
})
export class AdminUsersComponent implements OnInit {
  users: any[] = [];
  loading = true;
  filter = '';
  roleFilter = '';
  successMsg = '';
  errorMsg = '';

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.adminService.getAllUsers().subscribe({
      next: (data) => { this.users = data; this.loading = false; this.cdr.markForCheck(); this.cdr.markForCheck(); },
      error: () => { this.loading = false; },
    });
  }

  get filtered(): any[] {
    return this.users.filter(u => {
      const nameOk = !this.filter || u.name.toLowerCase().includes(this.filter.toLowerCase()) || u.email.toLowerCase().includes(this.filter.toLowerCase());
      const roleOk = !this.roleFilter || u.role === this.roleFilter;
      return nameOk && roleOk;
    });
  }

  toggleSuspend(user: any) {
    const action = user.isSuspended ? 'Activate' : 'Suspend';
    if (!confirm(`${action} ${user.name}?`)) return;
    this.adminService.toggleSuspend(user._id).subscribe({
      next: (res) => {
        user.isSuspended = res.user.isSuspended;
        this.successMsg = `User ${user.isSuspended ? 'suspended' : 'activated'} successfully.`;
        this.cdr.markForCheck();
      },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; this.cdr.markForCheck(); },
    });
  }

  deleteUser(user: any) {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    this.adminService.deleteUser(user._id).subscribe({
      next: () => { this.successMsg = 'User deleted.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}