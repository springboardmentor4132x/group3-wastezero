import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  success = false;
  error = '';
  successMessage = 'Check your inbox for a password reset email.';

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  submit() {
    if (!this.email.trim()) return;
    this.loading = true;
    this.error = '';
    this.success = false;
    this.http.post<{ message?: string; emailQueued?: boolean }>(`${environment.apiUrl}/auth/forgot-password`, { email: this.email }).subscribe({
      next: (res) => {
        if (res?.emailQueued === false) {
          this.error = res?.message
            || "We're facing an issue sending reset emails right now. Please try again in a few minutes.";
          this.success = false;
        } else {
          this.success = true;
          this.successMessage = res?.message || 'Check your inbox for a password reset email.';
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error = err?.error?.message
          || "We're facing an issue sending reset emails right now. Please try again in a few minutes.";
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}
