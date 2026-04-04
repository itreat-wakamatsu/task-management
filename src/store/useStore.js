import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const useStore = create((set, get) => ({
  // ── Auth ──
  session: null,
  setSession: (session) => set({ session }),

  // ── Master data ──
  clients:    [],
  projects:   [],
  categories: [],
  appTasks:   [],

  setClients:    (clients)    => set({ clients }),
  setProjects:   (projects)   => set({ projects }),
  setCategories: (categories) => set({ categories }),
  setAppTasks:   (appTasks)   => set({ appTasks }),

  // ── Today ──
  todayEvents:  [],  // カレンダーイベント + 実績を合わせた作業中リスト
  activeEventId: null,
  isPaused:      false,
  pausedAt:      null,

  // 開発環境専用: 任意の日付で動作確認するための仮想日付（本番では null）
  devDate: import.meta.env.DEV ? new Date() : null,

  addAppTask: (task) => set(s => ({ appTasks: [task, ...s.appTasks] })),

  setTodayEvents:  (evts)  => set({ todayEvents: evts }),
  setActiveEventId: (id)   => set({ activeEventId: id }),
  setIsPaused:     (v)    => set({ isPaused: v }),
  setPausedAt:     (d)    => set({ pausedAt: d }),
  setDevDate:      (d)    => set({ devDate: d }),

  /** イベントを1件更新 */
  updateEvent: (id, patch) =>
    set(s => ({
      todayEvents: s.todayEvents.map(e => e.id === id ? { ...e, ...patch } : e),
    })),

  // ── Master data loaders ──
  loadMasters: async () => {
    const [
      { data: clients },
      { data: projects },
      { data: categories },
    ] = await Promise.all([
      supabase.from('clients').select('*').is('deleted_at', null).order('id'),
      supabase.from('projects').select('*').is('deleted_at', null).order('id'),
      supabase.from('project_categories').select('*').is('deleted_at', null).order('project_id,order_no'),
    ])
    set({
      clients:    clients    || [],
      projects:   projects   || [],
      categories: categories || [],
    })
  },

  loadAppTasks: async (userId) => {
    const { data } = await supabase
      .from('app_tasks')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('usage_count', { ascending: false })
    set({ appTasks: data || [] })
  },

  /** タスクの usage_count をインクリメント（紐付け確定時） */
  incrementUsage: async (taskId) => {
    await supabase.rpc('increment', { table: 'app_tasks', id: taskId, column: 'usage_count' })
    set(s => ({
      appTasks: s.appTasks.map(t =>
        t.id === taskId ? { ...t, usageCount: (t.usage_count || 0) + 1 } : t
      ),
    }))
  },
}))
