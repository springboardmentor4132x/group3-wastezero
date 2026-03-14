import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn) {
    router.navigate(['/auth']);
    return false;
  }

  const requiredRoles: string[] = route.data?.['roles'] || [];
  if (requiredRoles.length && !requiredRoles.includes(auth.userRole)) {
    router.navigate(['/dashboard']);
    return false;
  }

  return true;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) {
    router.navigate(['/dashboard']);
    return false;
  }
  return true;
};
