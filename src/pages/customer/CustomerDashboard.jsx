import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import OrderCard from '../../components/OrderCard.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useCart } from '../../context/CartContext.jsx'

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export default function CustomerDashboard() {
  const { user } = useAuth()
  const { placedOrders, orderDraft, setOrderDraft } = useCart()
  const [quickText, setQuickText] = useState(orderDraft || '')
  const navigate = useNavigate()
  const startOrder = () => { setOrderDraft(quickText.trim()); navigate('/customer/ai-order') }
  return <div className="app-shell"><Navbar/><main className="page-width customer-dashboard">
    <div className="page-welcome"><div><span className="eyebrow">YOUR NEIGHBOURHOOD, AT YOUR DOOR</span><h1>{greeting()}, {user?.name || 'Neighbour'}<span className="title-dot">.</span></h1><p>What can we help you find today?</p></div><Link to="/customer/store" className="dashboard-avatar">🛍️</Link></div>
    <section className="customer-store-hero"><div className="store-hero-copy"><span className="open-label"><i/> OPEN NOW</span><span className="eyebrow store-hero-kicker">GROCERY & DAILY ESSENTIALS</span><h2>Sharma General Store</h2><p>Your friendly local store for the little things that make a day.</p><div className="hero-store-details"><span>★ <b>4.5</b> rating</span><span>⌁ 20–30 min</span><span>✓ Fresh essentials</span></div><Link to="/customer/store" className="primary-button">Shop now <span>→</span></Link></div><div className="customer-store-art" aria-hidden="true"><span className="customer-store-sun"/><div className="customer-shop-building"><span className="building-roof"/><span className="building-awning">SHARMA STORE</span><span className="building-window">🧺</span></div><span className="hero-art-leaf leaf-a">✦</span><span className="hero-art-leaf leaf-b">✦</span><span className="hero-art-sticker">🏪<small>YOUR LOCAL STORE</small></span></div></section>
    <section className="quick-order-card"><div className="quick-order-copy"><span className="ai-spark">✳</span><span className="eyebrow">A QUICKER WAY TO SHOP</span><h2>Just tell us what you need.</h2><p>Try Hinglish, English, or your voice. The store will sort out the details.</p><Link to="/customer/ai-order" onClick={() => setOrderDraft(quickText.trim())} className="text-link">How AI ordering works <span>→</span></Link></div><div className="quick-order-input"><label className="sr-only" htmlFor="quick-order">Your grocery list</label><textarea id="quick-order" value={quickText} onChange={(event) => setQuickText(event.target.value)} placeholder="Try: 2 kilo atta, ek Amul butter…" rows="2"/><Link to="/customer/ai-order" onClick={() => setOrderDraft(quickText.trim())} className="primary-button">Start AI order <span>→</span></Link></div></section>
    <section className="recent-orders"><div className="section-heading"><div><span className="eyebrow">YOUR SHOPPING, ALL IN ONE PLACE</span><h2>Recent orders</h2></div>{placedOrders.length > 0 && <Link className="section-link" to="/customer/orders">All orders →</Link>}</div>{placedOrders.length ? <div className="order-card-grid">{placedOrders.slice(0, 2).map((order) => <OrderCard key={order.order_id} order={order}/>)}</div> : <EmptyState icon="🧾" title="Your first order is waiting" message="Once you place an order, you can follow it right here." action="Browse the store" to="/customer/store"/>}</section>
  </main></div>
}
