import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import ProductCard from '../../components/ProductCard.jsx'
import Toast from '../../components/Toast.jsx'
import { products } from '../../services/api.js'
import { useCart } from '../../context/CartContext.jsx'

const categories = ['All', 'Atta & Rice', 'Oil', 'Dairy', 'Snacks', 'Beverages']
export default function Store() {
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const { products, itemCount, cartRemovedToast, setCartRemovedToast } = useCart()
  const visible = useMemo(() => products.filter((product) => (category === 'All' || product.category === category) && product.name.toLowerCase().includes(search.toLowerCase())), [products, category, search])
  const activeToast = toast || cartRemovedToast
  const closeToast = () => { setToast(''); setCartRemovedToast('') }
  return <div className="app-shell"><Navbar/><main className="page-width customer-store-page"><div className="back-row"><Link to="/customer/dashboard">← &nbsp;Back to dashboard</Link></div>
    <section className="store-page-banner"><div><span className="open-label"><i/> OPEN NOW</span><span className="eyebrow">GROCERY & DAILY ESSENTIALS</span><h1>Sharma General Store</h1><p>Your neighbourhood shop, a little closer.</p><div className="store-banner-meta"><span>★ 4.5 rating</span><span>⌁ 20–30 min delivery</span></div></div><span className="store-banner-emoji" aria-hidden="true">🧺</span></section>
    <section className="customer-products"><div className="section-heading"><div><span className="eyebrow">PICKED FOR YOUR EVERYDAY</span><h2>Shop the essentials</h2></div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products" aria-label="Search products"/></label></div><div className="category-row">{categories.map((item) => <button key={item} className={`category-chip ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{item}</button>)}</div><div className="customer-product-grid">{visible.map((product) => <ProductCard key={product.id} product={product} onAdded={setToast}/>)}</div>{!visible.length && <p className="empty-search">No products match your search.</p>}</section>
    <Link className="floating-ai-button" to="/customer/ai-order"><span>✳</span> Order with AI</Link>{itemCount > 0 && <Link className="floating-cart" to="/customer/cart"><span>🛒</span><span><strong>View cart</strong><small>{itemCount} items</small></span><b>→</b></Link>}
    <Toast message={activeToast} onClose={closeToast}/>
  </main></div>
}
