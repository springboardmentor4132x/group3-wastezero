import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AdminService } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-users.component.html',
})
export class AdminUsersComponent implements OnInit {
  users: any[] = [];
  loading = true;
  filter = '';
  roleFilter = '';
  page = 1;
  totalPages = 1;
  total = 0;
  successMsg = '';
  errorMsg = '';
  resetDialogOpen = false;
  resetSubmitting = false;
  resetTargetUser: any = null;
  resetForm = {
    newPassword: '',
    sendEmail: true,
  };

  constructor(private adminService: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  load() {
    this.loading = true;
    this.adminService.getUserActivity({
      page: this.page,
      limit: 20,
      role: (this.roleFilter as 'user' | 'volunteer') || undefined,
      search: this.filter || undefined,
    }).subscribe({
      next: (data) => {
        this.users = data.items || [];
        this.total = data.total || 0;
        this.totalPages = data.pages || 1;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get filtered(): any[] {
    return this.users;
  }

  applyFilters() {
    this.page = 1;
    this.load();
  }

  goToPage(next: number) {
    if (next < 1 || next > this.totalPages) return;
    this.page = next;
    this.load();
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

  toggleBlock(user: any) {
    const blocked = !user.isSuspended;
    const action = blocked ? 'Block' : 'Unblock';
    if (!confirm(`${action} ${user.name}?`)) return;

    this.adminService.toggleBlock(user._id, blocked).subscribe({
      next: (res) => {
        user.isSuspended = res.user.isSuspended;
        this.successMsg = `User ${blocked ? 'blocked' : 'unblocked'} successfully.`;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.errorMsg = err.error?.message || 'Error';
        this.cdr.markForCheck();
      },
    });
  }

  deleteUser(user: any) {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    this.adminService.deleteUser(user._id).subscribe({
      next: () => { this.successMsg = 'User deleted.'; this.load(); },
      error: (err) => { this.errorMsg = err.error?.message || 'Error'; },
    });
  }

  openResetPasswordDialog(user: any) {
    this.errorMsg = '';
    this.successMsg = '';
    this.resetTargetUser = user;
    this.resetDialogOpen = true;
    this.resetSubmitting = false;
    this.resetForm = {
      newPassword: this.generateStrongPassword(),
      sendEmail: true,
    };
    this.cdr.markForCheck();
  }

  closeResetPasswordDialog() {
    this.resetDialogOpen = false;
    this.resetSubmitting = false;
    this.resetTargetUser = null;
    this.resetForm = { newPassword: '', sendEmail: true };
    this.cdr.markForCheck();
  }

  refreshGeneratedPassword() {
    this.resetForm.newPassword = this.generateStrongPassword();
    this.cdr.markForCheck();
  }

  submitPasswordReset() {
    if (!this.resetTargetUser?._id) return;
    const password = (this.resetForm.newPassword || '').trim();
    if (password.length < 8) {
      this.errorMsg = 'Password must be at least 8 characters.';
      this.cdr.markForCheck();
      return;
    }

    this.resetSubmitting = true;
    this.adminService.resetUserPassword(this.resetTargetUser._id, {
      newPassword: password,
      sendEmail: this.resetForm.sendEmail,
    }).subscribe({
      next: (res) => {
        this.resetSubmitting = false;
        this.closeResetPasswordDialog();
        const emailText = res?.emailed ? ' and emailed to user' : '';
        this.successMsg = `Password reset successful${emailText}.`;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resetSubmitting = false;
        this.errorMsg = err?.error?.message || 'Failed to reset password';
        this.cdr.markForCheck();
      },
    });
  }

  sendResetLinkToken() {
    if (!this.resetTargetUser?._id) return;
    this.resetSubmitting = true;
    this.adminService.sendResetPasswordToken(this.resetTargetUser._id).subscribe({
      next: (res) => {
        this.resetSubmitting = false;
        this.closeResetPasswordDialog();
        if (res?.emailed === false) {
          const fallback = res?.resetUrl ? ` Manual reset link: ${res.resetUrl}` : '';
          this.errorMsg = `${res?.message || "We're facing an issue sending emails right now."}${fallback}`;
        } else {
          this.successMsg = res?.message || 'Password reset link token sent to user email.';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resetSubmitting = false;
        this.errorMsg = err?.error?.message || 'Failed to send reset link token';
        this.cdr.markForCheck();
      },
    });
  }

  private generateStrongPassword(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let out = '';
    for (let i = 0; i < 12; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}