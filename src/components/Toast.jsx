import { useEffect } from 'react'
export default function Toast({ message, onClose }) {
  useEffect(() => { if (!message) return undefined; const timer = window.setTimeout(onClose, 3500); return () => window.clearTimeout(timer) }, [message, onClose])
  if (!message) return null
  return <div className="toast" role="status"><span>✓</span><p>{message}</p><button onClick={onClose} aria-label="Dismiss notification">×</button></div>
}
