/* Isi satu iframe mockup: route asli aplikasi di MemoryRouter, dengan sandbox
   (data contoh, sesi contoh, kamera diam) yang dipasang sebelum render. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AppRouteTree } from '@/App'
import { ToastProvider } from '@/components/Toast'
import type { Screen } from './screens'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity } },
})

export function MockupFrame({ screen }: { screen: Screen }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[screen.path]}>
          <AppRouteTree />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
