import { Link, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import StatusTimeline from '../../components/StatusTimeline.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import { useCart } from '../../context/CartContext.jsx'

const stages = [
  { key: 'received', label: 'New Order', actionLabel: 'Set New' },
  { key: 'preparing', label: 'Preparing', actionLabel: 'Mark Preparing' },
  { key: 'packed', label: 'Packed', actionLabel: 'Mark Packed' },
  { key: 'out_for_delivery', label: 'Out for Delivery', actionLabel: 'Send Out for Delivery' },
  { key: 'delivered', label: 'Delivered', actionLabel: 'Mark Delivered' },
]

export default function OrderDetail() {
  const { orderId } = useParams()
  const { placedOrders, updatePlacedOrder } = useCart()

  const order = placedOrders.find((entry) => String(entry.order_id) === String(orderId))

  if (!order) {
    return <div className="app-shell">
      <Navbar/>
      <main className="page-width orders-page">
        <EmptyState icon="🔎" title="Order not found" message="We could not find an order with this ID." action="Back to orders" to="/store/orders?tab=placed"/>
      </main>
    </div>
  }

  const subtotal = order.items?.reduce((sum, item) => sum + item.product.price * item.quantity, 0) || 0
  const deliveryFee = Math.max(0, order.total - subtotal)

  const handleStatusChange = (newStatus) => {
    updatePlacedOrder(order.order_id, { status: newStatus, updated_at: new Date().toISOString() })
  }

  const currentStageIndex = stages.findIndex(s => s.key === order.status)

  return <div className="app-shell">
    <Navbar/>
    <main className="page-width order-details-page">
      <div className="back-row">
        <Link to="/store/orders?tab=placed">← &nbsp;Back to placed orders</Link>
      </div>

      <div className="page-title-row">
        <div>
          <span className="eyebrow">SHARMA GENERAL STORE · ORDER MANAGEMENT</span>
          <h1>Order #{order.order_id}</h1>
          <p>Customer: <strong>{order.customerName || 'Store customer'}</strong></p>
        </div>
        <StatusBadge status={order.status}/>
      </div>

      {/* Interactive Status Stepper Control */}
      <section className="detail-panel owner-stepper-panel">
        <div className="detail-panel-heading">
          <div>
            <h2>Order Status Stepper</h2>
            <p>Advance order status to update the customer live across all tabs.</p>
          </div>
          <span>Placed: {order.placed_at ? new Date(order.placed_at).toLocaleString() : 'Recently'}</span>
        </div>

        <StatusTimeline status={order.status}/>

        <div className="stepper-actions-bar">
          <span className="stepper-label">Change Status:</span>
          <div className="stepper-buttons">
            {stages.map((st, idx) => (
              <button
                key={st.key}
                className={`secondary-button step-btn ${order.status === st.key ? 'current-step' : ''} ${idx < currentStageIndex ? 'completed-step' : ''}`}
                onClick={() => handleStatusChange(st.key)}
              >
                {st.actionLabel}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Customer Info & Message */}
      {order.sourceMessage && (
        <section className="detail-panel">
          <div className="detail-panel-heading">
            <div>
              <h2>Original Customer Request</h2>
              <p>Message submitted by customer</p>
            </div>
          </div>
          <div className="customer-original">
            <p>“{order.sourceMessage}”</p>
          </div>
        </section>
      )}

      {/* Items Breakdown */}
      <section className="detail-panel">
        <div className="detail-panel-heading">
          <div>
            <h2>Items in this Order</h2>
            <p>{order.items?.length || 0} products</p>
          </div>
        </div>

        {order.items?.map(({ product, quantity }) => (
          <div className="detail-item" key={product.id}>
            <span>{product.emoji || '📦'}</span>
            <div>
              <strong>{product.name}</strong>
              <small>{quantity} {product.unit} × ₹{product.price}</small>
            </div>
            <b>₹{quantity * product.price}</b>
          </div>
        ))}

        <div className="detail-total-line">
          <span>Subtotal</span>
          <strong>₹{subtotal}</strong>
        </div>
        <div className="detail-total-line">
          <span>Delivery Fee</span>
          <strong>₹{deliveryFee}</strong>
        </div>
        <div className="detail-total-line order-grand-total">
          <span>Total Order Value</span>
          <strong>₹{order.total}</strong>
        </div>
      </section>
    </main>
  </div>
}
