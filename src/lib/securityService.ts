import { dbService } from '../dbService';

const DEFAULT_SALT_KEY = 'CafeEldeebAdminSecSalt2026';

/**
 * Computes SHA-256 hash using browser's native Web Crypto API
 */
export async function hashSecurityPassword(password: string, salt: string = DEFAULT_SALT_KEY): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${password.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a random salt string
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Checks if the Admin Security Password is set in settings
 */
export function isAdminSecurityPasswordSet(): boolean {
  const settings = dbService.getSettings();
  return Boolean(settings.admin_security_password_hash && settings.admin_security_password_hash.trim().length > 0);
}

/**
 * Verifies the provided Admin Security Password against the stored hash
 */
export async function verifyAdminSecurityPassword(password: string): Promise<boolean> {
  const settings = dbService.getSettings();
  const storedHash = settings.admin_security_password_hash;
  if (!storedHash) {
    return false;
  }
  const salt = settings.admin_security_password_salt || DEFAULT_SALT_KEY;
  const computedHash = await hashSecurityPassword(password, salt);
  return computedHash === storedHash;
}

/**
 * Sets or updates the Admin Security Password
 */
export async function setAdminSecurityPassword(newPassword: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashSecurityPassword(newPassword, salt);
  dbService.saveSettings({
    admin_security_password_hash: hash,
    admin_security_password_salt: salt
  });
}
