'use client'

import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneDisplay() {
  return typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export default function PWAInstallScaffold() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState('Install nonrevy for a faster, app-like mobile launcher.')

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Keep app behavior intact if service worker registration is blocked.
      })
    }

    if (isStandaloneDisplay()) return

    const beforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    const appInstalled = () => {
      setStatus('nonrevy is installed on this device.')
      setInstallPrompt(null)
      setVisible(false)
    }

    window.addEventListener('beforeinstallprompt', beforeInstallPrompt)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallPrompt)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setStatus(choice.outcome === 'accepted'
      ? 'Install started. nonrevy will open like an app from your device launcher.'
      : 'Install dismissed. You can still add nonrevy from your browser menu.'
    )
    setInstallPrompt(null)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <aside
      aria-label="Install nonrevy app"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 'calc(18px + env(safe-area-inset-bottom))',
        zIndex: 30,
        width: 'min(340px, calc(100vw - 36px))',
        border: '1px solid #38bdf8',
        borderRadius: 18,
        padding: 14,
        background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(49, 46, 129, 0.94))',
        color: '#f8fafc',
        boxShadow: '0 18px 45px rgba(2, 6, 23, 0.38)'
      }}
    >
      <strong style={{ color: '#38bdf8' }}>Install nonrevy</strong>
      <p style={{ color: '#cbd5e1', margin: '6px 0 12px' }}>{status}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={installApp}
          style={{ border: 'none', borderRadius: 999, padding: '10px 13px', background: '#38bdf8', color: '#020617', fontWeight: 'bold' }}
        >
          Install app
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          style={{ border: '1px solid #475569', borderRadius: 999, padding: '10px 13px', background: '#020617', color: '#cbd5e1', fontWeight: 'bold' }}
        >
          Not now
        </button>
      </div>
    </aside>
  )
}
