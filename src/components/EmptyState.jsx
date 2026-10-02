import { Link } from 'react-router-dom'
export default function EmptyState({ icon = '🧺', title, message, action, to = '/customer/store' }) {
  return <section className="empty-state"><span className="empty-state-icon">{icon}</span><h2>{title}</h2><p>{message}</p>{action && <Link className="primary-button" to={to}>{action} <span>→</span></Link>}</section>
}
