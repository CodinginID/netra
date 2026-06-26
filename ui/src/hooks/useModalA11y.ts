import { useEffect, useRef, useCallback } from 'react'

/**
 * Adds WCAG 2.1.2 / 2.4.3 accessibility to a modal:
 *  - Escape key closes the modal
 *  - Focus is trapped inside (Tab / Shift+Tab cycle within modal)
 *  - First focusable element is auto-focused on open
 *
 * Usage:
 *   const { modalRef, handleBackdropKeyDown } = useModalA11y({ isOpen, onClose })
 *   <div className="modal-backdrop" onKeyDown={handleBackdropKeyDown} onClick={onClose}>
 *     <div className="modal-card" ref={modalRef} onClick={(e) => e.stopPropagation()}>
 *       ...
 *     </div>
 *   </div>
 */
interface UseModalA11yOptions {
  /** Whether the modal is currently open */
  isOpen: boolean
  /** Callback invoked when Escape is pressed */
  onClose: () => void
}

interface UseModalA11yReturn {
  /** Attach to the modal card element (the inner dialog) */
  modalRef: React.RefObject<HTMLDivElement>
  /** Attach as onKeyDown on the backdrop element */
  handleBackdropKeyDown: (e: React.KeyboardEvent) => void
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function useModalA11y({ isOpen, onClose }: UseModalA11yOptions): UseModalA11yReturn {
  const modalRef = useRef<HTMLDivElement>(null!)

  // Escape key handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown)
      return () => document.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  // Auto-focus first focusable element when modal opens
  useEffect(() => {
    if (isOpen && modalRef.current) {
      const first = modalRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }
  }, [isOpen])

  // Focus trap: prevent Tab from escaping the modal
  const handleBackdropKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }, [])

  return { modalRef, handleBackdropKeyDown }
}
