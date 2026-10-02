import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'
export default function OrderCard({ order }) {
  return <article className="order-list-card"><div className="order-list-top"><div><span>ORDER #{order.order_id}</span><small>{order.placed_at ? new Date(order.placed_at).toLocaleDateString() : 'Recently placed'}</small></div><StatusBadge status={order.status}/></div><div className="order-list-middle"><strong>Sharma General Store</strong><span>{order.items?.length || 0} products</span></div><div className="order-list-bottom"><strong>₹{order.total}</strong><Link to={`/customer/orders/${order.order_id}`}>View details <span>→</span></Link></div></article>
}
