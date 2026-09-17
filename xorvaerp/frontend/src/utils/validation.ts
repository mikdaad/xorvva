/**
 * Client-side validation — mirrors the backend FluentValidation rules exactly
 * (RegisterUserValidator / LoginUserValidator), so users get instant feedback
 * instead of a round-trip 400.
 */

export function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Email is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (email.length > 256) return 'Email must not exceed 256 characters.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must not exceed 128 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/\d/.test(password)) return 'Password must contain a digit.';
  if (!/[!@#$%^&*(),.?"':{}|<>]/.test(password)) return 'Password must contain a special character.';
  return null;
}

export function validateName(name: string, field: string): string | null {
  if (!name.trim()) return `${field} is required.`;
  if (name.length > 100) return `${field} must not exceed 100 characters.`;
  return null;
}
