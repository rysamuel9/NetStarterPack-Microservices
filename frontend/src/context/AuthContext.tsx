import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import type { ApiResult, AuthResponse, CurrentUser, MenuItem } from '../types';

interface AuthContextType {
  user: CurrentUser | null;
  menus: MenuItem[];
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  refreshUserAndMenus: () => Promise<void>;
  hasPermission: (permissionCode?: string | null) => boolean;
  hasRole: (roleName: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<CurrentUser | null>(() => {
    try {
      const saved = localStorage.getItem('nsp_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [menus, setMenus] = useState<MenuItem[]>(() => {
    try {
      const saved = localStorage.getItem('nsp_menus');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  // Jika token & user sudah ada di localStorage, jangan blokir UI dengan spinner (stale-while-revalidate)
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const hasToken = !!localStorage.getItem('nsp_access_token');
    const hasCachedUser = !!localStorage.getItem('nsp_user');
    return hasToken && !hasCachedUser;
  });

  const fetchMenus = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<MenuItem[]>>('/menus/my-menus');
      if (res.data.succeeded && res.data.data) {
        setMenus(res.data.data);
        localStorage.setItem('nsp_menus', JSON.stringify(res.data.data));
      }
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const refreshUserAndMenus = useCallback(async () => {
    const token = localStorage.getItem('nsp_access_token');
    if (!token) {
      setUser(null);
      setMenus([]);
      localStorage.removeItem('nsp_menus');
      setIsLoading(false);
      return;
    }

    try {
      const [meRes, menuRes] = await Promise.all([
        api.get<ApiResult<CurrentUser>>('/auth/me'),
        api.get<ApiResult<MenuItem[]>>('/menus/my-menus'),
      ]);

      if (meRes.data.succeeded && meRes.data.data) {
        setUser(meRes.data.data);
        localStorage.setItem('nsp_user', JSON.stringify(meRes.data.data));
      }
      if (menuRes.data.succeeded && menuRes.data.data) {
        setMenus(menuRes.data.data);
        localStorage.setItem('nsp_menus', JSON.stringify(menuRes.data.data));
      }
    } catch {
      localStorage.removeItem('nsp_access_token');
      localStorage.removeItem('nsp_refresh_token');
      localStorage.removeItem('nsp_user');
      localStorage.removeItem('nsp_menus');
      setUser(null);
      setMenus([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUserAndMenus();
  }, [refreshUserAndMenus]);

  const login = async (usernameOrEmail: string, password: string) => {
    const res = await api.post<ApiResult<AuthResponse>>('/auth/login', {
      usernameOrEmail,
      password,
    });

    if (res.data.succeeded && res.data.data) {
      const { accessToken, refreshToken, user: loggedInUser } = res.data.data;
      localStorage.setItem('nsp_access_token', accessToken);
      localStorage.setItem('nsp_refresh_token', refreshToken);
      localStorage.setItem('nsp_user', JSON.stringify(loggedInUser));
      setUser(loggedInUser);
      await fetchMenus();
    } else {
      throw new Error(res.data.message || 'Gagal login.');
    }
  };

  const logout = async (allDevices = false) => {
    const refreshToken = localStorage.getItem('nsp_refresh_token');
    try {
      if (allDevices) {
        await api.post('/auth/logout-all');
      } else {
        await api.post('/auth/logout', { refreshToken });
      }
    } catch {
      // Ignore logout network error
    } finally {
      localStorage.removeItem('nsp_access_token');
      localStorage.removeItem('nsp_refresh_token');
      localStorage.removeItem('nsp_user');
      localStorage.removeItem('nsp_menus');
      setUser(null);
      setMenus([]);
    }
  };

  const hasRole = useCallback(
    (roleName: string) => {
      if (!user) return false;
      return user.roles.some((r) => r.toLowerCase() === roleName.toLowerCase());
    },
    [user]
  );

  const hasPermission = useCallback(
    (permissionCode?: string | null) => {
      if (!permissionCode) return true;
      if (!user) return false;
      if (user.roles.some((r) => r.toLowerCase() === 'superadmin')) return true;
      return user.permissions.some((p) => p.toLowerCase() === permissionCode.toLowerCase());
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        menus,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUserAndMenus,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
