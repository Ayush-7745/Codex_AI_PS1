import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const customerLinks = [
  ['/customer/dashboard', 'Dashboard'], ['/customer/store', 'Store'], ['/customer/ai-order', 'AI Order'], ['/customer/cart', 'Cart'], ['/customer/orders', 'Orders'],
]
const ownerLinks = [['/store/dashboard', 'Dashboard'], ['/store/products', 'Products'], ['/store/orders', 'Orders']]

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const { itemCount } = useCart()
  const navigate = useNavigate()
  const owner = user?.role === 'store_owner'
  const links = owner ? ownerLinks : customerLinks
  const signOut = () => { logout(); navigate('/login', { replace: true }) }
  return <header className="navbar app-navbar"><div className="navbar-inner">
    <Link to={owner ? '/store/dashboard' : '/customer/dashboard'} className="brand"><span className="brand-mark">✳</span><span>AI Order<span className="brand-light"> Desk</span></span></Link>
    <button className="nav-menu-toggle" aria-label={open ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? '×' : '☰'}</button>
    <nav className={`app-nav ${open ? 'is-open' : ''}`} aria-label="Main navigation">{links.map(([to, label]) => <NavLink key={to} to={to} onClick={() => setOpen(false)}>{label}{label === 'Cart' && <span className="cart-badge">{itemCount}</span>}</NavLink>)}</nav>
    <div className="nav-account"><span className="nav-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'N'}</span><span className="nav-user-name">{user?.name || 'Neighbour'}</span><button className="nav-logout" onClick={signOut}>Log out</button></div>
  </div></header>
}
