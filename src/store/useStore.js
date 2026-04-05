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
  todayEvents:   [],
  activeEventId: null,
  isPaused:      false,
  pausedAt:      null,

  // GCal キャッシュ（アプリ起動時に1回取得）
  rawCalEvents: [],
  rawCalDate:   null,

  devDate: (import.meta.env.DEV || import.meta.env.VITE_APP_ENV === 'development') ? new Date() : null,

  addAppTask: (task) => set(s => ({ appTasks: [task, ...s.appTasks] })),

  setRawCalEvents:  (events, dateStr) => set({ rawCalEvents: events, rawCalDate: dateStr }),
  setTodayEvents:   (evts) => set({ todayEvents: evts }),
  setActiveEventId: (id)   => set({ activeEventId: id }),
  setIsPaused:      (v)    => set({ isPaused: v }),
  setPausedAt:      (d)    => set({ pausedAt: d }),
  setDevDate:       (d)    => set({ devDate: d }),

  updateEvent: (id, patch) =>
    set(s => ({
      todayEvents: s.todayEvents.map(e => e.id === id ? { ...e, ...patch } : e),
    })),

  // ── Backlog ──
  backlogToken: null,
  setBacklogToken: (token) => set({ backlogToken: token }),

  loadBacklogToken: async (userId) => {
    const { data } = await supabase
      .from('backlog_tokens')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    set({ backlogToken: data ?? null })
  },

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

  incrementUsage: async (taskId) => {
    await supabase.rpc('increment', { table: 'app_tasks', id: taskId, column: 'usage_count' })
    set(s => ({
      appTasks: s.appTasks.map(t =>
        t.id === taskId ? { ...t, usageCount: (t.usage_count || 0) + 1 } : t
      ),
    }))
  },
}))
