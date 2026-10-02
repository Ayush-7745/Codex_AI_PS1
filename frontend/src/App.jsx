import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { dashboardForRole, useAuth } from './context/AuthContext.jsx'
import CustomerDashboard from './pages/customer/CustomerDashboard.jsx'
import CustomerStore from './pages/customer/Store.jsx'
import AIOrder from './pages/customer/AIOrder.jsx'
import CustomerCart from './pages/customer/Cart.jsx'
import Orders from './pages/customer/Orders.jsx'
import OrderDetails from './pages/customer/OrderDetails.jsx'
import CustomerOrderSuccess from './pages/customer/OrderSuccess.jsx'
import StoreDashboard from './pages/store/Dashboard.jsx'
import StoreProducts from './pages/store/Products.jsx'
import StoreProductForm from './pages/store/ProductForm.jsx'
import StoreOrders from './pages/store/Orders.jsx'
import StoreOrderDetail from './pages/store/OrderDetail.jsx'

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? dashboardForRole(user.role) : '/login'} replace />
}

export default function App() {
  return <Routes>
    <Route path="/" element={<HomeRedirect/>}/>
    <Route path="/login" element={<Login/>}/>
    <Route element={<ProtectedRoute role="customer"/>}>
      <Route path="/customer/dashboard" element={<CustomerDashboard/>}/>
      <Route path="/customer/store" element={<CustomerStore/>}/>
      <Route path="/customer/ai-order" element={<AIOrder/>}/>
      <Route path="/customer/cart" element={<CustomerCart/>}/>
      <Route path="/customer/orders" element={<Orders/>}/>
      <Route path="/customer/orders/:orderId" element={<OrderDetails/>}/>
      <Route path="/customer/order-success" element={<CustomerOrderSuccess/>}/>
      <Route path="/store" element={<Navigate to="/customer/store" replace/>}/>
      <Route path="/cart" element={<Navigate to="/customer/cart" replace/>}/>
      <Route path="/order-success" element={<Navigate to="/customer/order-success" replace/>}/>
      <Route path="/dashboard" element={<Navigate to="/customer/dashboard" replace/>}/>
    </Route>
    <Route element={<ProtectedRoute role="store_owner"/>}>
      <Route path="/store/dashboard" element={<StoreDashboard/>}/>
      <Route path="/store/products" element={<StoreProducts/>}/>
      <Route path="/store/products/add" element={<StoreProductForm/>}/>
      <Route path="/store/products/:id/edit" element={<StoreProductForm/>}/>
      <Route path="/store/orders" element={<StoreOrders/>}/>
      <Route path="/store/orders/:orderId" element={<StoreOrderDetail/>}/>
      <Route path="/store-desk" element={<Navigate to="/store/orders" replace/>}/>
    </Route>
    <Route path="*" element={<HomeRedirect/>}/>
  </Routes>
}
