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
  // UPDATED: Added 'verify' to the allowed tabs
  activeTab: 'login' | 'register' | 'verify' = 'login';
  loading = false;
  errorMsg = '';
  successMsg = '';

  loginForm = { username: '', password: '' };
  
  // NEW: Form data for OTP verification
  verifyForm = { email: '', otp: '' };

  registerForm = {
    name: '', email: '', username: '', password: '', confirmPassword: '',
    role: 'user', skills: '', location: '', bio: '', phone: '',
  };

  constructor(
    private authService: AuthService, 
    private router: Router,
    private cdr: ChangeDetectorRef 
  ) {}

  switchTab(tab: 'login' | 'register') {
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
    this.authService.login(this.loginForm).subscribe({
      next: () => { this.loading = false; this.router.navigate(['/dashboard']); },
      error: (err) => { 
        this.loading = false; 
        this.errorMsg = err.error?.message || 'Login failed.'; 
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

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      this.errorMsg = 'Please enter a valid email address.';
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      this.errorMsg = 'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.';
      return;
    }

    if (password !== confirmPassword) {
      this.errorMsg = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    const payload = {
      ...this.registerForm,
      skills: this.registerForm.skills ? this.registerForm.skills.split(',').map(s => s.trim()).filter(Boolean) : [],
    };
    
    this.authService.register(payload).subscribe({
      next: () => { 
        this.loading = false; 
        // UPDATED: Switch to the OTP screen instead of navigating to dashboard
        this.verifyForm.email = this.registerForm.email; 
        this.activeTab = 'verify';
        this.successMsg = 'Registration successful! Please check your email for the 6-digit verification code.';
        this.cdr.markForCheck();
      },
      error: (err) => { 
        this.loading = false; 
        this.errorMsg = err.error?.message || 'Registration failed.'; 
        this.cdr.markForCheck();
      },
    });
  }

  // NEW: Handle the OTP submission
  onVerify() {
    this.errorMsg = '';
    this.successMsg = '';

    if (!this.verifyForm.otp || this.verifyForm.otp.length !== 6) {
      this.errorMsg = 'Please enter the 6-digit verification code.';
      return;
    }

    this.loading = true;
    this.authService.verifyOtp(this.verifyForm).subscribe({
      next: () => { 
        this.loading = false; 
        this.router.navigate(['/dashboard']); 
      },
      error: (err) => { 
        this.loading = false; 
        this.errorMsg = err.error?.message || 'Verification failed. Invalid or expired OTP.'; 
        this.cdr.markForCheck();
      },
    });
  }
}