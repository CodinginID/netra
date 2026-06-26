import { useEffect, useRef, useCallback, useState } from 'react'

interface WSEvent {
  type: string
  tenant_id: string
  timestamp: string
  data: Record<string, unknown>
}

type EventHandler = (event: WSEvent) => void

interface UseWebSocketOptions {
  enabled?: boolean
  heartbeatInterval?: number
  reconnectDelays?: number[]
  /** Kiosk device token. When set, connects with ?device_token= instead of ?token= */
  deviceToken?: string | null
}

interface UseWebSocketReturn {
  connected: boolean
  reconnect: () => void
  disconnect: () => void
  on: (eventType: string, handler: EventHandler) => () => void
  once: (eventType: string, handler: EventHandler) => void
}

const DEFAULT_HEARTBEAT_INTERVAL = 30_000
const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30_000]
const HEARTBEAT_TIMEOUT = 10_000

function deriveWsUrl(): string {
  const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (apiBase) {
    const base = apiBase.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://')
    return base.replace(/\/api\/v1$/, '') + '/ws'
  }
  return `ws://${window.location.host}/ws`
}

function isWSSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}

export function useWebSocket(
  token: string | null | undefined,
  options?: UseWebSocketOptions,
): UseWebSocketReturn {
  const enabled = options?.enabled ?? true
  const heartbeatInterval = options?.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL
  const reconnectDelays = options?.reconnectDelays ?? DEFAULT_RECONNECT_DELAYS
  const deviceToken = options?.deviceToken ?? null

  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef(new Map<string, Set<EventHandler>>())
  const mountedRef = useRef(false)
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectIndexRef = useRef(0)
  const connectingRef = useRef(false)
  const manuallyDisconnectedRef = useRef(false)
  // Ref so buildUrl always sees the latest deviceToken without re-creating the callback
  const deviceTokenRef = useRef(deviceToken)
  useEffect(() => { deviceTokenRef.current = deviceToken }, [deviceToken])

  const buildUrl = useCallback((): string | null => {
    if (deviceTokenRef.current) {
      return `${deriveWsUrl()}?device_token=${encodeURIComponent(deviceTokenRef.current)}`
    }
    if (!token) return null
    return `${deriveWsUrl()}?token=${encodeURIComponent(token)}`
  }, [token])

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current)
      heartbeatTimeoutRef.current = null
    }
  }, [])

  const startHeartbeat = useCallback(
    (ws: WebSocket) => {
      clearHeartbeat()
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping')
          heartbeatTimeoutRef.current = setTimeout(() => {
            // Pong not received in time — connection is dead
            if (mountedRef.current) {
              ws.close(1001, 'heartbeat timeout')
            }
          }, HEARTBEAT_TIMEOUT)
        }
      }, heartbeatInterval)
    },
    [heartbeatInterval, clearHeartbeat],
  )

  const scheduleReconnect = useCallback(() => {
    if (manuallyDisconnectedRef.current || !mountedRef.current) return
    if (connectingRef.current) return

    const delay = reconnectDelays[reconnectIndexRef.current] ?? reconnectDelays[reconnectDelays.length - 1]
    reconnectIndexRef.current = Math.min(reconnectIndexRef.current + 1, reconnectDelays.length)

    reconnectTimerRef.current = setTimeout(() => {
      connectingRef.current = true
      connect()
    }, delay)
  }, [reconnectDelays])

  const emit = useCallback((event: WSEvent) => {
    const set = handlersRef.current.get(event.type)
    if (set) {
      // Copy to array so once-handlers can remove themselves during iteration
      for (const handler of [...set]) {
        handler(event)
      }
    }
    // Also emit on '*' for catch-all listeners
    const all = handlersRef.current.get('*')
    if (all) {
      for (const handler of [...all]) {
        handler(event)
      }
    }
  }, [])

  const connect = useCallback(() => {
    if (!enabled || !isWSSupported()) return

    const url = buildUrl()
    if (!url) return

    // Close existing
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
    clearHeartbeat()

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      connectingRef.current = false
      manuallyDisconnectedRef.current = false
      reconnectIndexRef.current = 0
      setConnected(true)
      startHeartbeat(ws)
    }

    ws.onmessage = (event: MessageEvent) => {
      if (!mountedRef.current) return

      // Handle pong response
      if (event.data === 'pong') {
        if (heartbeatTimeoutRef.current) {
          clearTimeout(heartbeatTimeoutRef.current)
          heartbeatTimeoutRef.current = null
        }
        return
      }

      try {
        const parsed: WSEvent = JSON.parse(event.data)
        emit(parsed)
      } catch {
        // Ignore non-JSON messages
      }
    }

    ws.onclose = () => {
      if (!mountedRef.current) return
      connectingRef.current = false
      clearHeartbeat()
      setConnected(false)
      if (!manuallyDisconnectedRef.current) {
        scheduleReconnect()
      }
    }

    ws.onerror = () => {
      // onclose will fire after onerror
    }
  }, [enabled, buildUrl, clearHeartbeat, startHeartbeat, emit, scheduleReconnect])

  const disconnect = useCallback(() => {
    manuallyDisconnectedRef.current = true
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    connectingRef.current = false
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
    clearHeartbeat()
    if (mountedRef.current) {
      setConnected(false)
    }
  }, [clearHeartbeat])

  const reconnect = useCallback(() => {
    manuallyDisconnectedRef.current = false
    reconnectIndexRef.current = 0
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    connect()
  }, [connect])

  const on = useCallback((eventType: string, handler: EventHandler): (() => void) => {
    const map = handlersRef.current
    if (!map.has(eventType)) {
      map.set(eventType, new Set())
    }
    map.get(eventType)!.add(handler)

    return () => {
      const set = map.get(eventType)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          map.delete(eventType)
        }
      }
    }
  }, [])

  const once = useCallback(
    (eventType: string, handler: EventHandler) => {
      const wrapped: EventHandler = (event) => {
        handler(event)
        unsubscribe()
      }
      const unsubscribe = on(eventType, wrapped)
    },
    [on],
  )

  // WebSocket feature detection
  useEffect(() => {
    if (!isWSSupported()) {
      console.warn('[useWebSocket] WebSocket is not supported in this browser — connection disabled')
    }
  }, [])

  // Mount / unmount tracking
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearHeartbeat()
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.onopen = null
        wsRef.current.onclose = null
        wsRef.current.onerror = null
        wsRef.current.onmessage = null
        wsRef.current.close()
        wsRef.current = null
      }
      handlersRef.current.clear()
      setConnected(false)
    }
  }, [clearHeartbeat])

  // Connect when token/deviceToken/enabled changes
  useEffect(() => {
    const hasAuth = !!(token || deviceToken)
    if (!enabled || !hasAuth || !isWSSupported()) {
      disconnect()
      return
    }
    manuallyDisconnectedRef.current = false
    reconnectIndexRef.current = 0
    connect()

    return () => {
      // Don't disconnect on every effect cleanup — only on unmount or token loss
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, deviceToken, enabled])

  // Stable references for returned callbacks
  const stableOn = useCallback(
    (eventType: string, handler: EventHandler) => on(eventType, handler),
    [on],
  )
  const stableOnce = useCallback(
    (eventType: string, handler: EventHandler) => once(eventType, handler),
    [once],
  )

  return {
    connected,
    reconnect,
    disconnect,
    on: stableOn,
    once: stableOnce,
  }
}

export type { WSEvent, EventHandler, UseWebSocketOptions, UseWebSocketReturn }
