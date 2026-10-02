import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import OrderCard from '../../components/OrderCard.jsx'
import EmptyState from '../../components/EmptyState.jsx'
import { useCart } from '../../context/CartContext.jsx'

export default function Orders() {
  const { placedOrders } = useCart()
  return <div className="app-shell"><Navbar/><main className="page-width orders-page"><div className="back-row"><Link to="/customer/dashboard">← &nbsp;Dashboard</Link></div><div className="page-title-row"><div><span className="eyebrow">YOUR SHOPPING HISTORY</span><h1>Your orders<span className="title-dot">.</span></h1><p>Keep an eye on everything from Sharma General Store.</p></div></div>{placedOrders.length ? <div className="orders-list">{placedOrders.map((order) => <OrderCard key={order.order_id} order={order}/>)}</div> : <EmptyState icon="🧾" title="No orders yet" message="Your confirmed orders will show up here, along with live store updates." action="Shop everyday essentials" to="/customer/store"/>}</main></div>
}
