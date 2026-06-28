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

  // Drag-to-dismiss (mobile bottom sheets): drag the top of the card down to
  // close. Only engages on small screens and only when the gesture starts in
  // the top handle zone, so it never fights inputs/scrolling inside the card.
  useEffect(() => {
    const card = modalRef.current
    if (!isOpen || !card) return
    if (window.matchMedia('(min-width: 769px)').matches) return

    let startY = 0
    let dy = 0
    let dragging = false

    const onStart = (e: TouchEvent) => {
      const top = card.getBoundingClientRect().top
      if (e.touches[0].clientY - top > 48) return // only the handle zone
      dragging = true
      startY = e.touches[0].clientY
      card.style.transition = 'none'
    }
    const onMove = (e: TouchEvent) => {
      if (!dragging) return
      dy = Math.max(0, e.touches[0].clientY - startY)
      card.style.transform = `translateY(${dy}px)`
    }
    const onEnd = () => {
      if (!dragging) return
      dragging = false
      card.style.transition = 'transform 0.25s cubic-bezier(0.4,0,0.2,1)'
      if (dy > 100) onClose()
      else card.style.transform = 'translateY(0)'
      dy = 0
    }

    card.addEventListener('touchstart', onStart, { passive: true })
    card.addEventListener('touchmove', onMove, { passive: true })
    card.addEventListener('touchend', onEnd)
    return () => {
      card.removeEventListener('touchstart', onStart)
      card.removeEventListener('touchmove', onMove)
      card.removeEventListener('touchend', onEnd)
    }
  }, [isOpen, onClose])

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
