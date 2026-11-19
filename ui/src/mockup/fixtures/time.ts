/* Waktu relatif untuk data contoh mockup: semua tanggal dihitung dari hari ini,
   jadi layar selalu tampak "hidup" kapan pun mockup dibuka. */

const DAY_MS = 86_400_000

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Tanggal lokal YYYY-MM-DD, `offsetDays` dari hari ini (negatif = lampau). */
export function day(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Timestamp ISO pada jam lokal tertentu, `offsetDays` dari hari ini. */
export function at(offsetDays: number, hour: number, minute = 0): string {
  const d = new Date(Date.now() + offsetDays * DAY_MS)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** Timestamp ISO `minutes` menit yang lalu. */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}
