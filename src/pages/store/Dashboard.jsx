import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useCart } from '../../context/CartContext.jsx'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { products, placedOrders, deskOrder } = useCart()

  const todayStr = new Date().toDateString()
  const todayOrders = useMemo(() => {
    return placedOrders.filter(o => {
      const date = o.placed_at || o.createdAt
      return date && new Date(date).toDateString() === todayStr
    })
  }, [placedOrders, todayStr])

  const todaySales = useMemo(() => {
    return todayOrders.reduce((sum, o) => sum + (o.total || 0), 0)
  }, [todayOrders])

  const lowStockCount = useMemo(() => {
    return products.filter(p => p.stock > 0 && p.stock <= 5).length
  }, [products])

  const greeting = getGreeting()
  const recentOrders = placedOrders.slice(0, 5)

  return <div className="app-shell">
    <Navbar/>
    <main className="page-width customer-dashboard">
      <div className="page-welcome">
        <div>
          <span className="eyebrow">SHARMA GENERAL STORE · OWNER DASHBOARD</span>
          <h1>{greeting}, {user?.name || 'Store Owner'}!</h1>
          <p>Here is what’s happening at Sharma General Store today.</p>
        </div>
        <div className="dashboard-avatar">🏪</div>
      </div>

      {/* Stat cards grid */}
      <section className="store-stats-grid">
        <div className="stat-card">
          <span className="stat-icon">📦</span>
          <div>
            <span className="stat-label">Today's Orders</span>
            <strong className="stat-value">{todayOrders.length}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">🏷️</span>
          <div>
            <span className="stat-label">Total Products</span>
            <strong className="stat-value">{products.length}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">⚠️</span>
          <div>
            <span className="stat-label">Low Stock</span>
            <strong className="stat-value">{lowStockCount}</strong>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon">💰</span>
          <div>
            <span className="stat-label">Today's Sales</span>
            <strong className="stat-value">₹{todaySales}</strong>
          </div>
        </div>
      </section>

      {/* Pending AI Requests Card */}
      <section className="dashboard-ai-card">
        <div className="ai-card-header">
          <span className="ai-spark">✳</span>
          <div>
            <h3>Pending AI Requests</h3>
            <p>Customer voice & typed orders needing review</p>
          </div>
        </div>
        {deskOrder ? (
          <div className="ai-card-content">
            <div className="ai-request-preview">
              <span className="request-tag">{deskOrder.inputMode === 'voice' ? 'VOICE' : 'TYPED'} · {deskOrder.id}</span>
              <p>“{deskOrder.text}”</p>
            </div>
            <Link className="primary-button" to="/store/orders?tab=requests">Review AI request <span>→</span></Link>
          </div>
        ) : (
          <div className="ai-card-content empty-ai-request">
            <p>No pending AI requests right now. All caught up!</p>
            <Link className="secondary-button" to="/store/orders?tab=requests">Open AI inbox <span>→</span></Link>
          </div>
        )}
      </section>

      {/* Recent Orders Section */}
      <section className="recent-orders">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ORDER INBOX</span>
            <h2>Recent Orders</h2>
          </div>
          <Link className="section-link" to="/store/orders?tab=placed">View all orders <span>→</span></Link>
        </div>

        {recentOrders.length ? (
          <div className="orders-table-wrapper">
            <table className="store-orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.order_id}>
                    <td className="order-id-cell">#{order.order_id}</td>
                    <td>{order.customerName || 'Store customer'}</td>
                    <td className="order-price-cell">₹{order.total}</td>
                    <td><StatusBadge status={order.status}/></td>
                    <td>
                      <Link className="table-action-link" to={`/store/orders/${order.order_id}`}>View Order →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inbox-empty">
            <h2>No placed orders yet</h2>
            <p>Customer checkouts will appear here automatically.</p>
          </div>
        )}
      </section>
    </main>
  </div>
}
