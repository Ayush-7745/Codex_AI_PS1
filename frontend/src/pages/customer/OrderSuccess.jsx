import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import StatusTimeline from '../../components/StatusTimeline.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import Toast from '../../components/Toast.jsx'
import { useCart } from '../../context/CartContext.jsx'
import { getOrderDocument } from '../../services/api.js'

export default function OrderSuccess() {
  const location = useLocation()
  const navigate = useNavigate()
  const { clearCart, placedOrders } = useCart()
  const [order] = useState(() => location.state?.order || JSON.parse(sessionStorage.getItem('ai-order-last') || 'null'))
  const [toast, setToast] = useState('')
  useEffect(() => { if (!order) navigate('/customer/store', { replace: true }); else clearCart() }, [])
  if (!order) return null
  const liveOrder = placedOrders.find((entry) => String(entry.order_id) === String(order.order_id)) || order
  const showDocument = async (type) => {
    const document = await getOrderDocument(order.order_id, type)
    setToast(`${type === 'bill' ? 'Bill' : 'Delivery note'} is ready for order #${order.order_id} · ${document.store || 'Sharma General Store'}.`)
  }
  return <div className="app-shell"><Navbar/><main className="page-width success-page"><section className="success-card"><span className="success-checkmark" aria-hidden="true">✓</span><span className="eyebrow">THANKS FOR SHOPPING LOCAL</span><h1>Order confirmed<span className="title-dot">.</span></h1><p>Sharma General Store has received your order.</p><div className="success-order-summary"><div><span>ORDER ID</span><strong>#{order.order_id}</strong></div><div><span>STORE</span><strong>Sharma General Store</strong></div><div><span>TOTAL</span><strong>₹{order.total}</strong></div><div><span>ESTIMATED DELIVERY</span><strong>20–30 minutes</strong></div></div><div className="success-status"><div className="detail-panel-heading"><div><h2>Live store status</h2><p>Updates as the store prepares your order</p></div><StatusBadge status={liveOrder.status}/></div><StatusTimeline status={liveOrder.status}/></div><div className="success-actions"><Link className="primary-button" to={`/customer/orders/${order.order_id}`}>View order <span>→</span></Link><button className="secondary-button" onClick={() => showDocument('bill')}>Download bill</button><button className="secondary-button" onClick={() => showDocument('delivery-note')}>Delivery note</button></div><Link className="back-store-link" to="/customer/store">← &nbsp;Back to the store</Link></section></main><Toast message={toast} onClose={() => setToast('')}/></div>
}
