/**
 * Paths module — now returns virtual paths that get normalized
 * by fs.ts into Supabase keys. The actual storage is in Supabase,
 * but we keep the same path structure so store.ts doesn't change.
 */

const VIRTUAL_ROOT = "/data";

export function getDataRoot(): string {
  return VIRTUAL_ROOT;
}

export function ensureDataReady(): void {
  // No-op in Supabase mode — initialization happens via ensureSupabaseData()
  // This function is called everywhere but is now just a compatibility shim
}

export const paths = {
  tasks: () => `${VIRTUAL_ROOT}/tasks/tasks.json`,
  payments: () => `${VIRTUAL_ROOT}/payments/payments.json`,
  clientsDir: () => `${VIRTUAL_ROOT}/clients`,
  memory: (file: string) => `${VIRTUAL_ROOT}/memory/${file}`,
  festivals: () => `${VIRTUAL_ROOT}/calendar/festivals.json`,
  festivalClients: () => `${VIRTUAL_ROOT}/calendar/festival-clients.json`,
  disabledReminders: () => `${VIRTUAL_ROOT}/calendar/disabled-reminders.md`,
  settings: () => `${VIRTUAL_ROOT}/settings/config.json`,
  chatHistory: () => `${VIRTUAL_ROOT}/chat/history.json`,
  chatSessions: () => `${VIRTUAL_ROOT}/chat/sessions.json`,
  uploads: () => `${VIRTUAL_ROOT}/uploads`,
  instagramAccounts: () => `${VIRTUAL_ROOT}/instagram/accounts.json`,
  instagramFollowups: () => `${VIRTUAL_ROOT}/instagram/followups.json`,
  instagramPendingOffer: () => `${VIRTUAL_ROOT}/instagram/pending-offer.json`,
  workSnoozes: () => `${VIRTUAL_ROOT}/notifications/work-snoozes.json`,
};
