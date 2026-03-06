import { Component, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
})
export class AuthComponent {
  activeTab: 'login' | 'register' = 'login';
  loading = false;
  errorMsg = '';
  successMsg = '';

  showLoginPw = false;
  showRegPw = false;
  showRegConfirmPw = false;

  loginForm = { username: '', password: '' };

  registerForm = {
    name: '', email: '', username: '', password: '', confirmPassword: '',
    role: 'user', skills: '', location: '', bio: '', phone: '',
  };

  // Forgot password (OTP) flow
  forgotMode = false;
  forgotStep: 'email' | 'otp' = 'email';
  forgotEmail = '';
  forgotOtp = '';
  forgotNewPassword = '';
  forgotConfirmPassword = '';
  forgotLoading = false;
  forgotError = '';
  forgotSuccess = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  switchTab(tab: 'login' | 'register') {
    this.forgotMode = false;
    this.activeTab = tab;
    this.errorMsg = '';
    this.successMsg = '';
  }

  onLogin() {
    this.errorMsg = '';
    if (!this.loginForm.username || !this.loginForm.password) {
      this.errorMsg = 'Please enter username and password.';
      return;
    }
    this.loading = true;
    this.cdr.markForCheck();
    this.authService.login(this.loginForm).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.message || 'Login failed. Please check your credentials.';
        this.cdr.markForCheck();
      },
    });
  }

  onRegister() {
    this.errorMsg = '';
    const { name, email, username, password, confirmPassword } = this.registerForm;
    if (!name || !email || !username || !password) {
      this.errorMsg = 'Please fill all required fields.';
      return;
    }
    if (password !== confirmPassword) {
      this.errorMsg = 'Passwords do not match.';
      return;
    }
    if (password.length < 6) {
      this.errorMsg = 'Password must be at least 6 characters.';
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();
    const payload = {
      ...this.registerForm,
      skills: this.registerForm.skills ? this.registerForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    this.authService.register(payload).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.message || 'Registration failed. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  toggleLoginPw() { this.showLoginPw = !this.showLoginPw; }
  toggleRegPw() { this.showRegPw = !this.showRegPw; }
  toggleRegConfirmPw() { this.showRegConfirmPw = !this.showRegConfirmPw; }

  // ── Forgot password (OTP) flow ───────────────────────────────────────────
  openForgotPassword() {
    this.forgotMode = true;
    this.forgotStep = 'email';
    this.forgotEmail = '';
    this.forgotOtp = '';
    this.forgotNewPassword = '';
    this.forgotConfirmPassword = '';
    this.forgotError = '';
    this.forgotSuccess = '';
  }

  backToLogin() {
    this.forgotMode = false;
    this.forgotStep = 'email';
    this.forgotError = '';
    this.forgotSuccess = '';
  }

  onSendOtp() {
    this.forgotError = '';
    this.forgotSuccess = '';
    if (!this.forgotEmail) {
      this.forgotError = 'Please enter your registered email.';
      return;
    }
    this.forgotLoading = true;
    this.cdr.markForCheck();
    this.authService.requestPasswordReset({ email: this.forgotEmail }).subscribe({
      next: (res) => {
        this.forgotLoading = false;
        this.forgotStep = 'otp';
        this.forgotSuccess =
          res?.message ||
          'If that email is registered, we have sent a 6-digit OTP to your inbox.';
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.forgotLoading = false;
        this.forgotError = err.error?.message || 'Failed to send OTP. Please try again.';
        this.cdr.markForCheck();
      },
    });
  }

  onVerifyAndReset() {
    this.forgotError = '';
    this.forgotSuccess = '';
    if (!this.forgotEmail || !this.forgotOtp) {
      this.forgotError = 'Please enter your email and the 6-digit OTP.';
      return;
    }
    if (this.forgotOtp.trim().length !== 6) {
      this.forgotError = 'OTP must be 6 digits.';
      return;
    }
    if (!this.forgotNewPassword || !this.forgotConfirmPassword) {
      this.forgotError = 'Please enter and confirm your new password.';
      return;
    }
    if (this.forgotNewPassword !== this.forgotConfirmPassword) {
      this.forgotError = 'Passwords do not match.';
      return;
    }
    if (this.forgotNewPassword.length < 6) {
      this.forgotError = 'Password must be at least 6 characters.';
      return;
    }

    this.forgotLoading = true;
    this.cdr.markForCheck();
    this.authService
      .resetPassword({
        email: this.forgotEmail,
        otp: this.forgotOtp.trim(),
        newPassword: this.forgotNewPassword,
      })
      .subscribe({
        next: (res) => {
          this.forgotLoading = false;
          this.forgotSuccess =
            res?.message || 'Password reset successful. You can now log in with your new password.';
          // Optionally auto-switch back to login after a short delay
          setTimeout(() => {
            this.backToLogin();
            this.activeTab = 'login';
            this.loginForm.username = this.forgotEmail;
            this.cdr.markForCheck();
          }, 1500);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.forgotLoading = false;
          this.forgotError = err.error?.message || 'Failed to reset password. Please try again.';
          this.cdr.markForCheck();
        },
      });
  }
}
