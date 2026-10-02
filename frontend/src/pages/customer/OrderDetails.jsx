import { Link, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import StatusTimeline from '../../components/StatusTimeline.jsx'
import { useCart } from '../../context/CartContext.jsx'

export default function OrderDetails() {
  const { orderId } = useParams()
  const { placedOrders } = useCart()
  const order = placedOrders.find((entry) => String(entry.order_id) === String(orderId))
  const subtotal = order?.items?.reduce((sum, item) => sum + item.product.price * item.quantity, 0) || 0
  if (!order) return <div className="app-shell"><Navbar/><main className="page-width orders-page"><EmptyState icon="🔎" title="We couldn’t find that order" message="It may have been cleared from this browser." action="View all orders" to="/customer/orders"/></main></div>
  return <div className="app-shell"><Navbar/><main className="page-width order-details-page"><div className="back-row"><Link to="/customer/orders">← &nbsp;All orders</Link></div><div className="page-title-row"><div><span className="eyebrow">SHARMA GENERAL STORE</span><h1>Order #{order.order_id}</h1></div><StatusBadge status={order.status}/></div><section className="detail-panel"><div className="detail-panel-heading"><div><h2>Order status</h2><p>{order.placed_at ? new Date(order.placed_at).toLocaleString() : 'Recently placed'}</p></div><span>⌁ &nbsp;20–30 min</span></div><StatusTimeline status={order.status}/></section><section className="detail-panel"><div className="detail-panel-heading"><div><h2>Items in this order</h2><p>{order.items.length} products</p></div></div>{order.items.map(({ product, quantity }) => <div className="detail-item" key={product.id}><span>{product.emoji}</span><div><strong>{product.name}</strong><small>{quantity} {product.unit} × ₹{product.price}</small></div><b>₹{quantity * product.price}</b></div>)}<div className="detail-total-line"><span>Subtotal</span><strong>₹{subtotal}</strong></div><div className="detail-total-line"><span>Delivery</span><strong>₹{Math.max(0, order.total - subtotal)}</strong></div><div className="detail-total-line order-grand-total"><span>Total</span><strong>₹{order.total}</strong></div></section></main></div>
}
