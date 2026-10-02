import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { dashboardForRole, useAuth } from '../context/AuthContext.jsx'

export default function Login() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roleSwitch = searchParams.get('switch') === '1'
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('customer')
  const [values, setValues] = useState({ name: '', identifier: '', password: '' })
  const [error, setError] = useState('')
  if (user && !roleSwitch) return <Navigate to={dashboardForRole(user.role)} replace />
  const update = (event) => { setValues((current) => ({ ...current, [event.target.name]: event.target.value })); setError('') }
  const submit = (event) => {
    event.preventDefault()
    const result = mode === 'register' ? register({ ...values, role }) : login({ ...values, role })
    if (result.error) { setError(result.error); return }
    navigate(dashboardForRole(result.user.role), { replace: true })
  }
  return <main className="auth-page">
    <header className="auth-page-header"><Link to="/login" className="brand"><span className="brand-mark">✳</span><span>AI Order<span className="brand-light"> Desk</span></span></Link><span className="auth-header-note">Sharma General Store <i/></span></header>
    <section className="auth-page-body">
      <div className="auth-welcome"><span className="eyebrow">YOUR NEIGHBOURHOOD, MADE SIMPLE</span><h1>Good things<br/>are <em>closer.</em></h1><p>Order everyday groceries in the words you use. Your local store will take it from there.</p><div className="auth-welcome-points"><span>✳ &nbsp;Order in Hinglish or English</span><span>⌁ &nbsp;20–30 minute delivery</span></div><div className="auth-art" aria-hidden="true"><span className="auth-art-circle"/><span className="auth-art-bag">🛍️</span><span className="auth-art-float art-one">🥬</span><span className="auth-art-float art-two">🥛</span><span className="auth-art-float art-three">🍎</span></div></div>
      <section className="auth-card" aria-labelledby="auth-heading">
        <span className="auth-card-kicker">{mode === 'login' ? 'WELCOME BACK' : 'JOIN YOUR NEIGHBOURHOOD'}</span>
        <h2 id="auth-heading">{mode === 'login' ? 'Sign in to continue' : 'Create your account'}</h2>
        <p>{mode === 'login' ? 'Pick up where your grocery list left off.' : 'It only takes a moment to get started.'}</p>
        <div className="role-control" role="group" aria-label="Choose account type"><button type="button" className={role === 'customer' ? 'selected' : ''} aria-pressed={role === 'customer'} onClick={() => setRole('customer')}><span>🛒</span> Customer</button><button type="button" className={role === 'store_owner' ? 'selected' : ''} aria-pressed={role === 'store_owner'} onClick={() => setRole('store_owner')}><span>🏪</span> Store Owner</button></div>
        <form className="auth-fields" onSubmit={submit} noValidate>
          {mode === 'register' && <div className="form-field"><label htmlFor="auth-name">Name</label><input id="auth-name" name="name" value={values.name} onChange={update} autoComplete="name" placeholder="Your name"/></div>}
          <div className="form-field"><label htmlFor="auth-identifier">Email or mobile number</label><input id="auth-identifier" name="identifier" value={values.identifier} onChange={update} autoComplete="username" placeholder="you@example.com or 98765 43210"/></div>
          <div className="form-field"><label htmlFor="auth-password">Password</label><input id="auth-password" type="password" name="password" value={values.password} onChange={update} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder={mode === 'register' ? 'At least 4 characters' : 'Enter your password'}/></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit">{mode === 'login' ? 'Sign in' : 'Create account'} <span>→</span></button>
        </form>
        <div className="auth-toggle">{mode === 'login' ? <><span>Don’t have an account?</span><button type="button" onClick={() => { setMode('register'); setError('') }}>Register</button></> : <><span>Already have an account?</span><button type="button" onClick={() => { setMode('login'); setError('') }}>Sign in</button></>}</div>
        <div className="auth-demo-hint">Demo sign in · Any non-empty email/mobile and a 4+ character password</div>
      </section>
    </section>
    <footer className="auth-page-footer"><span>© 2025 AI Order Desk</span><span>Good groceries. Good neighbours.</span></footer>
  </main>
}
