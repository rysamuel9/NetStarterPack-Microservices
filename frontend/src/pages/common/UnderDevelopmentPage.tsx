import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Construction, ArrowLeft, LayoutDashboard, Menu as MenuIcon, Code2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const UnderDevelopmentPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <Construction className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-800">
            UNDER DEVELOPMENT
          </span>
          <h1 className="text-2xl font-bold text-slate-900">Halaman Sedang Dalam Pengembangan</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Route <code className="px-2 py-0.5 rounded bg-slate-100 text-teal-800 font-mono text-xs">{location.pathname}</code>{' '}
            sudah terdaftar di navigasi sidebar, tapi komponen halaman React-nya belum dibuat di codebase.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <Code2 className="w-4 h-4 text-teal-600" />
            <span>Langkah developer untuk mengaktifkan halaman ini:</span>
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Buat file halaman baru di <code>frontend/src/pages/</code>.</li>
            <li>
              Daftarkan <code>&lt;Route path="{location.pathname.replace(/^\//, '')}" ... /&gt;</code> di{' '}
              <code>frontend/src/App.tsx</code>.
            </li>
            <li>Sambungkan ke microservice backend yang sesuai lewat YARP Gateway (<code>:5080</code>).</li>
          </ol>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-semibold"
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Ke Mesh Dashboard</span>
          </button>

          {hasPermission('Menus.View') && (
            <button
              type="button"
              onClick={() => navigate('/menus')}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <MenuIcon className="w-4 h-4" />
              <span>Atur Menu</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
