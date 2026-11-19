import React from 'react';
import { Crown, Users } from 'lucide-react';
import type { DirectorateTreeNode } from '../../types';

interface OrganizationTreeViewProps {
  tree: DirectorateTreeNode[];
}

export const OrganizationTreeView: React.FC<OrganizationTreeViewProps> = ({ tree }) => {
  return (
    <div className="space-y-5">
      {tree.map((dir) => (
        <div key={dir.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-5 bg-gradient-to-r from-slate-900 to-teal-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-mono font-bold">
                  {dir.code}
                </span>
                <span className="text-xs text-slate-300">
                  {dir.divisions.length} Divisi • {dir.userCount} Karyawan
                </span>
              </div>
              <h2 className="text-lg font-bold mt-1">{dir.name}</h2>
              <p className="text-xs text-slate-300 mt-0.5">{dir.description}</p>
            </div>

            {dir.headFullName && (
              <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-3 shrink-0">
                <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                  <Crown className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                    Kepala Direktorat
                  </p>
                  <p className="text-sm font-bold text-white">{dir.headFullName}</p>
                  <p className="text-[11px] text-teal-200">
                    {dir.headPositionName || 'Director'} (@{dir.headUsername})
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dir.divisions.map((div) => (
              <div key={div.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold">
                        {div.code}
                      </span>
                      <span className="text-[11px] text-slate-500">{div.userCount} orang</span>
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{div.name}</h3>
                    {div.headFullName && (
                      <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-900">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-cyan-700">Div Head:</span>
                        <span className="font-semibold">{div.headFullName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {div.departments.map((dept) => (
                    <div key={dept.id} className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-slate-400">{dept.code}</span>
                          <p className="text-xs font-bold text-slate-800">{dept.name}</p>
                          {dept.headFullName && (
                            <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                              Dept Head: {dept.headFullName}
                            </p>
                          )}
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
                          <Users className="w-3 h-3" /> {dept.userCount}
                        </span>
                      </div>

                      {dept.members.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {dept.members.map((m) => {
                            const isDeptHead = dept.headUserId === m.id;
                            return (
                              <span
                                key={m.id}
                                className={`px-2.5 py-1 rounded-lg border text-[11px] ${
                                  isDeptHead
                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-950'
                                    : 'bg-teal-50/70 border-teal-200/70 text-slate-700'
                                }`}
                              >
                                <strong className={isDeptHead ? 'text-indigo-950' : 'text-slate-900'}>
                                  {m.fullName}
                                </strong>
                                {m.positionName && (
                                  <span className={isDeptHead ? 'text-indigo-700 font-medium' : 'text-teal-700'}>
                                    {' '}• {m.positionName}
                                  </span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
