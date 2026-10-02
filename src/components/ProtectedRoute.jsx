import { Navigate, Outlet } from 'react-router-dom'
import { dashboardForRole, useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={dashboardForRole(user.role)} replace />
  return <Outlet />
}
