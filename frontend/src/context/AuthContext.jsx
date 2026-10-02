import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)
const AUTH_KEY = 'ai-order-auth-user'
const TAB_AUTH_KEY = 'ai-order-tab-user'
const readUser = () => {
  try { return JSON.parse(sessionStorage.getItem(TAB_AUTH_KEY) || localStorage.getItem(AUTH_KEY) || 'null') } catch { return null }
}

export function dashboardForRole(role) {
  return role === 'store_owner' ? '/store/dashboard' : '/customer/dashboard'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser)
  const saveUser = (next) => {
    setUser(next)
    if (next) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(next))
      sessionStorage.setItem(TAB_AUTH_KEY, JSON.stringify(next))
    } else {
      localStorage.removeItem(AUTH_KEY)
      sessionStorage.removeItem(TAB_AUTH_KEY)
    }
  }
  const login = ({ identifier, password, role }) => {
    if (!identifier?.trim()) return { error: 'Enter your email or mobile number.' }
    if (!password || password.length < 4) return { error: 'Password must be at least 4 characters.' }
    const inferredName = identifier.includes('@') ? identifier.split('@')[0] : 'Neighbour'
    const next = { name: inferredName, identifier: identifier.trim(), role }
    saveUser(next)
    return { user: next }
  }
  const register = ({ name, identifier, password, role }) => {
    if (!name?.trim()) return { error: 'Enter your name.' }
    if (!identifier?.trim()) return { error: 'Enter your email or mobile number.' }
    if (!password || password.length < 4) return { error: 'Password must be at least 4 characters.' }
    const next = { name: name.trim(), identifier: identifier.trim(), role }
    saveUser(next)
    return { user: next }
  }
  const logout = () => saveUser(null)
  const value = useMemo(() => ({ user, login, register, logout }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
