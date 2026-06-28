import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useI18n } from '@/store/i18nStore'

interface PaginationProps {
  page: number
  limit: number
  total: number
  pages: number
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
}

export function Pagination({ page, limit, total, pages, onPageChange, onLimitChange }: PaginationProps) {
  const { t } = useI18n()
  if (pages <= 1) return null

  const limitOptions = [10, 20, 50, 100]

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '12px 0',
      fontSize: 13,
      color: 'var(--color-text-muted)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{total} {t('pagination.items')}</span>
        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="field-input"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            aria-label={t('pagination.per_page_label')}
          >
            {limitOptions.map((n) => (
              <option key={n} value={n}>{n} {t('pagination.per_page')}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button
          className="btn btn-sm btn-ghost"
          disabled={page === 1}
          onClick={() => onPageChange(1)}
          aria-label={t('pagination.first')}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('pagination.prev')}
        >
          <ChevronLeft size={14} />
        </button>

        {/* Page numbers — show max 5 around current */}
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          let p: number
          if (pages <= 5) {
            p = i + 1
          } else if (page <= 3) {
            p = i + 1
          } else if (page >= pages - 2) {
            p = pages - 4 + i
          } else {
            p = page - 2 + i
          }
          return (
            <button
              key={p}
              className={`btn btn-sm${p === page ? ' btn-primary' : ' btn-ghost'}`}
              onClick={() => onPageChange(p)}
              aria-label={t('pagination.page', { page: p })}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        })}

        <button
          className="btn btn-sm btn-ghost"
          disabled={page === pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('pagination.next')}
        >
          <ChevronRight size={14} />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          disabled={page === pages}
          onClick={() => onPageChange(pages)}
          aria-label={t('pagination.last')}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </div>
  )
}
