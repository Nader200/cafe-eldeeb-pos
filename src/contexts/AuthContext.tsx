import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, UserRole } from '../types';
import { dbService, safeStorage } from '../dbService';

const AUTH_STORAGE_KEY = 'cafe_eldeeb_logged_user';
const REMEMBER_ME_KEY = 'cafe_eldeeb_remember_me';

interface AuthContextType {
  currentUser: AuthUser | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, rememberMe: boolean) => void;
  logout: () => void;
  hasPermission: (tab: string) => boolean;
  userRole: UserRole | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const stored = safeStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as AuthUser;
      }
    } catch (e) {
      console.error('Failed to parse logged user from storage', e);
    }
    return null;
  });

  const login = (user: AuthUser, rememberMe: boolean) => {
    setCurrentUser(user);
    try {
      safeStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      safeStorage.setItem(REMEMBER_ME_KEY, String(rememberMe));
    } catch (e) {
      console.error('Failed to store logged user session', e);
    }
  };

  const logout = () => {
    if (currentUser) {
      // Record Audit Log for Logout
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0];

      dbService.addAuthAuditLog({
        employee_name: currentUser.name,
        username: currentUser.username,
        role: currentUser.role,
        action: 'LOGOUT',
        date: dateStr,
        time: timeStr,
        timestamp: now.toISOString()
      });
    }

    setCurrentUser(null);
    try {
      safeStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to remove logged user session', e);
    }
  };

  const hasPermission = (tab: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin') return true;

    // Cashier allowed tabs
    if (currentUser.role === 'Cashier') {
      const allowedCashierTabs = [
        'pos',
        'open-invoices',
        'invoice-history',
        'invoices',
        'playstation'
      ];
      return allowedCashierTabs.includes(tab);
    }

    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        login,
        logout,
        hasPermission,
        userRole: currentUser ? currentUser.role : null
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
