import React, { useState } from 'react';
import { UserAvatar } from '../../components/UserAvatar';
import { UserCheck, KeyRound, Save } from 'lucide-react';
import { api, getErrorMessage } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { validateFileForUpload } from '../../utils/fileUpload';

export const ProfilePage: React.FC = () => {
  const { user, refreshUserAndMenus } = useAuth();

  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phoneNumber: user?.phoneNumber || '',
    department: user?.department || '',
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
  });

  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);

    const validationError = await validateFileForUpload(file, 'avatar');
    if (validationError) {
      setMsg({ type: 'error', text: validationError });
      return;
    }

    try {
      setUploading(true);
      const form = new FormData();
      form.append('file', file);
      await api.post('/auth/avatar', form);
      await refreshUserAndMenus();
      setMsg({ type: 'success', text: 'Foto profil berhasil diperbarui!' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setMsg(null);
    try {
      setUploading(true);
      await api.delete('/auth/avatar');
      await refreshUserAndMenus();
      setMsg({ type: 'success', text: 'Foto profil dihapus.' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.put('/auth/profile', profileForm);
      await refreshUserAndMenus();
      setMsg({ type: 'success', text: 'Profil berhasil diperbarui!' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/auth/change-password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      setMsg({ type: 'success', text: 'Password berhasil diperbarui!' });
    } catch (err) {
      setMsg({ type: 'error', text: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Profil & Keamanan Akun</h1>
        <p className="text-sm text-slate-500">
          Kelola informasi profil Anda serta keamanan kredensial login.
        </p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-xl text-sm border ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="bg-gradient-to-r from-slate-950 via-teal-950 to-slate-900 rounded-2xl p-6 text-white border border-teal-800/40 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              userId={user?.id}
              name={user?.fullName}
              sizeClass="w-16 h-16 text-xl"
              colorClass="bg-teal-500/20 border-2 border-teal-400/30 text-teal-200"
            />
            <div className="flex flex-col gap-1.5">
              <label
                className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-xs font-semibold cursor-pointer ${
                  uploading ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                {uploading ? 'Memproses...' : 'Ganti Foto'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
              {user?.avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="text-[11px] text-rose-300 hover:text-rose-200 text-left"
                >
                  Hapus foto
                </button>
              )}
              <span className="text-[10px] text-slate-400">JPG / PNG / WebP, maksimal 5 MB</span>
            </div>
          </div>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 mb-1.5">
              {user?.employeeCode || 'NO-NIK'} • PROFIL ORGANISASI
            </span>
            <h2 className="text-xl font-bold">{user?.fullName}</h2>
            <p className="text-sm text-teal-300 font-semibold mt-0.5">
              {user?.positionName || 'Posisi belum ditetapkan'}
              {user?.positionLevel ? ` (Level ${user.positionLevel})` : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Direktorat</p>
              <p className="font-bold text-white mt-0.5">{user?.directorateName || '-'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Divisi</p>
              <p className="font-bold text-white mt-0.5">{user?.divisionName || '-'}</p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Departemen</p>
              <p className="font-bold text-white mt-0.5">
                {user?.departmentName || user?.department || '-'}
              </p>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <p className="text-[10px] text-slate-300 uppercase">Atasan Langsung</p>
              <p className="font-bold text-amber-300 mt-0.5">
                {user?.managerFullName || 'Top Executive'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">Informasi Pribadi</h2>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Username</label>
              <input
                type="text"
                disabled
                value={user?.username || ''}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nama Lengkap
              </label>
              <input
                type="text"
                required
                value={profileForm.fullName}
                onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={profileForm.email}
                onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  No. Telepon
                </label>
                <input
                  type="text"
                  value={profileForm.phoneNumber}
                  onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Departemen
                </label>
                <input
                  type="text"
                  value={profileForm.department}
                  onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Perubahan Profil</span>
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            <h2 className="font-bold text-slate-900">Ganti Password</h2>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password Saat Ini
              </label>
              <input
                type="password"
                required
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password Baru (Minimal 6 Karakter)
              </label>
              <input
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              <KeyRound className="w-4 h-4" />
              <span>Perbarui Password</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
