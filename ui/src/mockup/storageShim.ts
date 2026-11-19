/* Harus diimpor PALING AWAL di build mandiri. Di preview yang merender HTML
   dalam iframe sandbox (origin "null"), mengakses localStorage melempar
   SecurityError dan aplikasi berhenti sebelum tampil. Di sana localStorage
   diganti penyimpanan di memori. */

function memory(): Storage {
  const mem = new Map<string, string>()
  return {
    get length() { return mem.size },
    clear: () => mem.clear(),
    getItem: (k) => mem.get(k) ?? null,
    key: (i) => [...mem.keys()][i] ?? null,
    removeItem: (k) => { mem.delete(k) },
    setItem: (k, v) => { mem.set(k, String(v)) },
  }
}

try {
  void window.localStorage.length
} catch {
  Object.defineProperty(window, 'localStorage', { value: memory(), configurable: true })
  Object.defineProperty(window, 'sessionStorage', { value: memory(), configurable: true })
}

export {}
