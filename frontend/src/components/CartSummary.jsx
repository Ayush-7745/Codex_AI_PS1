import { useNavigate } from 'react-router-dom'

export default function CartSummary({ subtotal, onConfirm, loading = false }) {
  const navigate = useNavigate()
  const delivery = subtotal === 0 ? 0 : 20
  return <aside className="summary-card"><h2>Order summary</h2><div className="summary-line"><span>Subtotal</span><strong>₹{subtotal}</strong></div><div className="summary-line"><span>Delivery</span><strong>{delivery ? `₹${delivery}` : '—'}</strong></div><div className="free-delivery-note">🚲 &nbsp;Quick delivery from your neighbourhood</div><div className="summary-total"><span>Total</span><strong>₹{subtotal + delivery}</strong></div><button className="primary-button full-button" disabled={subtotal === 0 || loading} onClick={onConfirm}>{loading ? 'Confirming…' : 'Confirm order'} <span>→</span></button><button className="text-button full-button" onClick={() => navigate('/customer/store')}>← &nbsp;Keep shopping</button><p className="secure-note">🔒 &nbsp;No payment needed now</p></aside>
}
