import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { User } from '../../models/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  activeTab: 'profile' | 'password' = 'profile';
  loading = false;
  successMsg = '';
  errorMsg = '';

  profileForm: any = {};
  passwordForm = { currentPassword: '', newPassword: '', confirmNew: '' };

  constructor(public auth: AuthService, private userService: UserService,   private cdr: ChangeDetectorRef, ) {}

  ngOnInit() {
    this.user = this.auth.currentUser;
    this.initForm();
    this.userService.getProfile().subscribe({
      next: (u) => { this.user = u; this.initForm(); },
      error: () => {},
    });
  }

  initForm() {
    if (!this.user) return;
    this.profileForm = {
      name: this.user.name,
      email: this.user.email,
      location: this.user.location || '',
      bio: this.user.bio || '',
      phone: this.user.phone || '',
      skills: Array.isArray(this.user.skills) ? this.user.skills.join(', ') : '',
      latitude: this.user.geometry?.coordinates?.[1] || '',
      longitude: this.user.geometry?.coordinates?.[0] || '',
    };
  }

  getLocation() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.profileForm.latitude = position.coords.latitude;
          this.profileForm.longitude = position.coords.longitude;
          this.cdr.detectChanges();
        },
        (error) => {
          this.errorMsg = 'Could not get location. You can enter coordinates manually.';
          this.cdr.detectChanges();
        }
      );
    } else {
      this.errorMsg = 'Geolocation is not supported by this browser.';
    }
  }

  saveProfile() {
    this.loading = true; this.errorMsg = ''; this.successMsg = '';
    const payload = {
      ...this.profileForm,
      skills: this.profileForm.skills ? this.profileForm.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    };
    if (this.profileForm.latitude === '') delete payload.latitude;
    if (this.profileForm.longitude === '') delete payload.longitude;
    this.userService.updateProfile(payload).subscribe({
      next: (u) => {
        this.loading = false;
        this.successMsg = 'Profile updated successfully!';
        this.auth.updateCurrentUser(u);
        this.user = u;
      },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Update failed'; },
    });
  }

  changePassword() {
    this.errorMsg = ''; this.successMsg = '';
    const { currentPassword, newPassword, confirmNew } = this.passwordForm;
    if (!currentPassword || !newPassword) { this.errorMsg = 'Please fill all fields'; return; }
    if (newPassword !== confirmNew) { this.errorMsg = 'New passwords do not match'; return; }
    if (newPassword.length < 6) { this.errorMsg = 'Password must be at least 6 characters'; return; }
    this.loading = true;
    this.userService.changePassword({ currentPassword, newPassword }).subscribe({
      next: () => { this.loading = false; this.successMsg = 'Password changed successfully!'; this.passwordForm = { currentPassword: '', newPassword: '', confirmNew: '' }; },
      error: (err) => { this.loading = false; this.errorMsg = err.error?.message || 'Failed'; },
    });
  }

  get initials(): string {
    return this.user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';
  }

  trackById(_: number, item: any): string { return item?._id || item?.id || _; }
  trackByIndex(i: number): number { return i; }
}