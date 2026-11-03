import { apiFetch } from '@/api/adminApi'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

/** Admin sets a new password for a staff account in the scoped tenant (forgotten password). */
export async function resetUserPassword(token: string, userId: string, newPassword: string): Promise<void> {
  await apiFetch<unknown>(`${API_BASE}/users/${userId}/reset-password`, token, {
    method: 'POST',
    body: JSON.stringify({ new_password: newPassword }),
  })
}
