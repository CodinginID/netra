/* Data contoh satu tenant (PT Sinar Jaya) untuk mockup. Semua nama dan angka
   dibuat-buat; tidak ada salinan data tenant asli. */
import type {
  ApiKeyOut,
  AttendanceOut,
  AttendanceRecap,
  DailyStatus,
  DailyStatusValue,
  DeviceOut,
  OnboardingStatus,
  ScheduleOut,
  UserOut,
  UserRecap,
} from '@/api/adminApi'
import { at, day, minutesAgo } from './time'

export const TENANT_ID = 't-sinar-jaya'

interface Person {
  name: string
  ext: string
  role?: string
  enrolled?: boolean
  active?: boolean
  /** Status hari ini; jam masuk/pulang dalam [jam, menit]. */
  today: DailyStatusValue
  inAt?: [number, number]
  outAt?: [number, number]
}

const PEOPLE: Person[] = [
  { name: 'Rina Wijaya', ext: 'EMP-0042', today: 'present', inAt: [7, 52] },
  { name: 'Budi Santoso', ext: 'EMP-0007', today: 'late', inAt: [8, 21] },
  { name: 'Siti Rahmawati', ext: 'EMP-0013', today: 'checked_out', inAt: [7, 40], outAt: [16, 5] },
  { name: 'Agus Pratama', ext: 'EMP-0019', today: 'present', inAt: [7, 58] },
  { name: 'Dewi Lestari', ext: 'EMP-0023', today: 'absent', enrolled: false },
  { name: 'Hendra Gunawan', ext: 'EMP-0031', today: 'present', inAt: [7, 45], role: 'supervisor' },
  { name: 'Maya Putri', ext: 'EMP-0034', today: 'late', inAt: [8, 37] },
  { name: 'Yusuf Hidayat', ext: 'EMP-0038', today: 'absent' },
  { name: 'Lina Marlina', ext: 'EMP-0040', today: 'present', inAt: [7, 49] },
  { name: 'Fajar Nugroho', ext: 'EMP-0045', today: 'absent', enrolled: false },
  { name: 'Wulan Sari', ext: 'EMP-0047', today: 'present', inAt: [7, 55] },
  { name: 'Rudi Hartono', ext: 'EMP-0050', today: 'absent', active: false },
]

const userId = (i: number) => `u-${String(i + 1).padStart(3, '0')}`

export const users: UserOut[] = PEOPLE.map((p, i) => ({
  id: userId(i),
  tenant_id: TENANT_ID,
  full_name: p.name,
  role: p.role ?? 'end_user',
  username: p.name.split(' ')[0].toLowerCase(),
  email: `${p.name.split(' ')[0].toLowerCase()}@sinarjaya.co.id`,
  external_id: p.ext,
  is_active: p.active ?? true,
  enrolled: p.enrolled ?? true,
  created_at: at(-90 + i * 3, 9),
}))

export const trashedUsers: UserOut[] = [
  { ...users[0], id: 'u-901', full_name: 'Andi Kurniawan', external_id: 'EMP-0003', email: null, deleted_at: at(-5, 10) },
  { ...users[0], id: 'u-902', full_name: 'Tari Anggraini', external_id: 'EMP-0011', email: null, deleted_at: at(-21, 14) },
]

export const dailyStatus: DailyStatus[] = PEOPLE.filter((p) => p.active !== false).map((p, i) => ({
  user_id: userId(i),
  full_name: p.name,
  external_id: p.ext,
  status: p.today,
  check_in_at: p.inAt ? at(0, p.inAt[0], p.inAt[1]) : null,
  check_out_at: p.outAt ? at(0, p.outAt[0], p.outAt[1]) : null,
}))

/** Hari lampau: sebagian orang tidak hadir supaya grafik tren bervariasi. */
function attendedOn(i: number, offsetDays: number): boolean {
  return offsetDays === 0 || (i * 3 - offsetDays) % 5 !== 0
}

function punches(offsetDays: number): AttendanceOut[] {
  const rows: AttendanceOut[] = []
  PEOPLE.forEach((p, i) => {
    const inAt = p.inAt ?? (offsetDays < 0 && p.active !== false && p.enrolled !== false ? [7, 50] : undefined)
    if (!inAt || !attendedOn(i, offsetDays)) return
    const late = offsetDays === 0 ? p.today === 'late' : (i + offsetDays) % 4 === 0
    rows.push({
      id: `a-${offsetDays}-${i}-in`, user_id: userId(i), type: 'check_in',
      status: late ? 'late' : 'on_time', occurred_at: at(offsetDays, inAt[0], inAt[1]),
      liveness_score: 0.97, device_id: 'd-lobi', location: null, created_at: at(offsetDays, inAt[0], inAt[1]),
    })
    const out = p.outAt ?? (offsetDays < 0 ? [17, 4 + i] : undefined)
    if (out) {
      rows.push({
        id: `a-${offsetDays}-${i}-out`, user_id: userId(i), type: 'check_out', status: 'on_time',
        occurred_at: at(offsetDays, out[0], out[1]), liveness_score: 0.95, device_id: 'd-lobi',
        location: null, created_at: at(offsetDays, out[0], out[1]),
      })
    }
  })
  return rows
}

const BY_DAY = new Map(Array.from({ length: 8 }, (_, k) => [day(-k), punches(-k)]))

export const attendance: AttendanceOut[] = [...BY_DAY.values()].flat()
  .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

export function dailyRecap(date: string): AttendanceRecap {
  const rows = BY_DAY.get(date) ?? []
  const count = (pred: (a: AttendanceOut) => boolean) => rows.filter(pred).length
  const ids = [...new Set(rows.map((a) => a.user_id))]
  const users: UserRecap[] = ids.map((id) => {
    const mine = rows.filter((a) => a.user_id === id)
    const n = (pred: (a: AttendanceOut) => boolean) => mine.filter(pred).length
    return {
      user_id: id, full_name: fullName(id), on_time: n((a) => a.status === 'on_time'), late: n((a) => a.status === 'late'),
      early_leave: 0, check_in: n((a) => a.type === 'check_in'), check_out: n((a) => a.type === 'check_out'),
    }
  })
  return {
    period_start: date, period_end: date, total_records: rows.length,
    on_time: count((a) => a.status === 'on_time'), late: count((a) => a.status === 'late'),
    early_leave: 0, check_in: count((a) => a.type === 'check_in'), check_out: count((a) => a.type === 'check_out'),
    users,
  }
}

function fullName(id: string): string {
  return users.find((u) => u.id === id)?.full_name ?? ''
}

export const devices: DeviceOut[] = [
  { id: 'd-lobi', name: 'Kiosk Lobi Utama', status: 'active', last_seen_at: minutesAgo(2), created_at: at(-80, 10), token_available: true },
  { id: 'd-gudang', name: 'Kiosk Gudang Timur', status: 'active', last_seen_at: minutesAgo(190), created_at: at(-60, 11), token_available: true },
  { id: 'd-lama', name: 'Tablet Resepsionis (lama)', status: 'revoked', last_seen_at: at(-30, 16), created_at: at(-200, 9), token_available: false },
]

export const trashedDevices: DeviceOut[] = [
  { id: 'd-uji', name: 'Kiosk Uji Coba', status: 'revoked', last_seen_at: null, created_at: at(-40, 9), deleted_at: at(-9, 15) },
]

const WEEKDAYS = ['1', '2', '3', '4', '5']

export const schedules: ScheduleOut[] = [
  {
    id: 's-kantor', name: 'Jam Kantor', grace_minutes: 10, geofence: null, is_default: true, created_at: at(-85, 9),
    rules: { type: 'shift', day_hours: Object.fromEntries(WEEKDAYS.map((d) => [d, { start: '08:00', end: '17:00' }])) },
  },
  {
    id: 's-gudang', name: 'Shift Gudang Pagi', grace_minutes: 5, geofence: null, is_default: false, created_at: at(-70, 9),
    rules: { type: 'shift', day_hours: Object.fromEntries([...WEEKDAYS, '6'].map((d) => [d, { start: '07:00', end: '15:00' }])) },
  },
  {
    id: 's-pelatihan', name: 'Pelatihan Karyawan Baru', grace_minutes: 15, geofence: null, is_default: false, created_at: at(-20, 9),
    rules: {
      type: 'session',
      day_sessions: { '2': [{ name: 'Pagi', start: '08:00', end: '12:00' }, { name: 'Siang', start: '13:00', end: '16:00' }] },
    },
  },
]

export const apiKeys: ApiKeyOut[] = [
  {
    id: 'k-hris', name: 'HRIS Produksi', prefix: 'ntr_live_8f2a', scopes: ['enroll:write', 'attendance:read'],
    allowed_origins: ['https://hr.sinarjaya.co.id'], status: 'active', last_used_at: minutesAgo(35),
    expires_at: at(20, 0), created_at: at(-160, 9),
  },
  {
    id: 'k-payroll', name: 'Payroll Bulanan', prefix: 'ntr_live_c41d', scopes: ['attendance:read'],
    allowed_origins: [], status: 'active', last_used_at: at(-3, 23), expires_at: null, created_at: at(-120, 9),
  },
  {
    id: 'k-uji', name: 'Uji coba vendor', prefix: 'ntr_test_02be', scopes: ['enroll:write'],
    allowed_origins: [], status: 'revoked', last_used_at: at(-50, 10), expires_at: null, created_at: at(-90, 9),
  },
]

export const apiScopes: Record<string, string> = {
  'enroll:write': 'Mendaftarkan wajah lewat embed',
  'attendance:read': 'Membaca data absensi',
  'users:read': 'Membaca daftar pengguna',
}

export const onboarding: OnboardingStatus = {
  completed: true,
  steps: { welcome: true, schedule: true, device: true, users: true, test: true },
}
