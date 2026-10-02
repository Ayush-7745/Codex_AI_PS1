import { useLocation } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'

const labels = {
  '/store/dashboard': 'Store dashboard',
  '/store/products': 'Products',
  '/store/products/add': 'Add a product',
  '/store/orders': 'Orders',
}

export default function ComingNext() {
  const { pathname } = useLocation()
  const title = labels[pathname] || (pathname.startsWith('/store/orders/') ? 'Order details' : 'Store dashboard')
  return <div className="app-shell"><Navbar/><main className="page-width coming-page"><section className="coming-card"><span className="coming-icon">🏪</span><span className="eyebrow">STORE OWNER WORKSPACE</span><h1>{title}</h1><p>This part of the Sharma General Store workspace is coming next.</p><a className="primary-button" href="/store-desk">Open the current order desk <span>→</span></a></section></main></div>
}
