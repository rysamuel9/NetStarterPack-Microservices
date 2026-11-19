import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  permission?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, permission }) => {
  const { isAuthenticated, isLoading, hasPermission, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Lagi ngecek sesi login...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="p-8 max-w-xl mx-auto mt-12 bg-white rounded-2xl border border-rose-200 shadow-xs text-center">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Belum Punya Akses (403)</h2>
        <p className="text-sm text-slate-600 mb-4">
          Akun kamu sekarang (<strong>{user?.username}</strong> — Role:{' '}
          <span className="font-semibold text-indigo-600">{user?.roles.join(', ')}</span>) belum
          dikasih permission{' '}
          <code className="px-1.5 py-0.5 bg-slate-100 rounded text-rose-600">{permission}</code>{' '}
          buat buka halaman ini.
        </p>
        <p className="text-xs text-slate-500">
          Kalau mau ngetes halaman ini, coba login pakai akun <strong>superadmin</strong> atau
          centang permission-nya lewat menu <em>Role & Hak Akses</em>.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};
