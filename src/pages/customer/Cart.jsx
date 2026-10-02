import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import CartSummary from '../../components/CartSummary.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import { useCart } from '../../context/CartContext.jsx'
import { confirmOrder } from '../../services/api.js'

import Toast from '../../components/Toast.jsx'

export default function Cart() {
  const { products, items, setQuantity, removeItem, subtotal, publishConfirmedOrder, cartRemovedToast, setCartRemovedToast } = useCart()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const navigate = useNavigate()

  const confirm = async () => {
    for (const item of items) {
      const liveProd = products.find((p) => p.id === item.product.id)
      if (!liveProd || liveProd.stock <= 0) {
        setToast(`Cannot place order: "${item.product.name}" is out of stock.`)
        return
      }
      if (item.quantity > liveProd.stock) {
        setToast(`Cannot place order: "${item.product.name}" only has ${liveProd.stock} ${liveProd.unit} in stock (requested ${item.quantity}).`)
        return
      }
    }

    setLoading(true)
    try {
      const orderItems = items.map((item) => ({ ...item }))
      const response = await confirmOrder(orderItems)
      const order = publishConfirmedOrder(response, orderItems)
      sessionStorage.setItem('ai-order-last', JSON.stringify(order))
      navigate('/customer/order-success', { state: { order } })
    } finally { setLoading(false) }
  }

  const activeToast = toast || cartRemovedToast
  const closeToast = () => { setToast(''); setCartRemovedToast('') }

  return <div className="app-shell"><Navbar/><main className="page-width customer-cart-page"><div className="back-row"><Link to="/customer/store">← &nbsp;Continue shopping</Link></div><div className="page-title-row"><div><span className="eyebrow">SHARMA GENERAL STORE</span><h1>Your cart<span className="title-dot">.</span></h1></div><span className="cart-count-label">{items.length} {items.length === 1 ? 'product' : 'products'}</span></div>
    {items.length ? <div className="cart-layout"><section className="cart-items-panel"><div className="cart-panel-top"><h2>Your items</h2><Link to="/customer/store">+ Add more</Link></div>{items.map(({ product, quantity }) => <article className="cart-item" key={product.id}><div className={`cart-product-art ${product.color}`}>{product.emoji}</div><div className="cart-product-copy"><span>{product.brand || product.category}</span><h3>{product.name}</h3><p>₹{product.price} / {product.unit}</p></div><div className="quantity-control"><button onClick={() => setQuantity(product.id, quantity - 1)} aria-label={`Decrease ${product.name} quantity`}>−</button><span>{quantity}</span><button onClick={() => setQuantity(product.id, quantity + 1)} aria-label={`Increase ${product.name} quantity`}>+</button></div><strong className="cart-line-total">₹{product.price * quantity}</strong><button className="remove-item" onClick={() => removeItem(product.id)} aria-label={`Remove ${product.name}`}>×</button></article>)}<p className="cart-footnote">✳ &nbsp;Freshly picked from your neighbourhood store.</p></section><CartSummary subtotal={subtotal} onConfirm={confirm} loading={loading}/></div> : <EmptyState icon="🧺" title="Your basket’s taking a break" message="Find a few everyday favourites at Sharma General Store." action="Browse the store" to="/customer/store"/>}</main>
    <Toast message={activeToast} onClose={closeToast}/>
  </div>
}
