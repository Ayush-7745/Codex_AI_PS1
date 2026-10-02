import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import AIOrderBox from '../../components/AIOrderBox.jsx'
import { useCart } from '../../context/CartContext.jsx'

export default function AIOrder() {
  const { orderDraft } = useCart()
  return <div className="app-shell"><Navbar/><main className="page-width ai-order-page"><div className="back-row"><Link to="/customer/dashboard">← &nbsp;Back to dashboard</Link></div><div className="ai-page-intro"><span className="eyebrow">YOUR LIST, YOUR WORDS</span><h1>Tell us what you need<span className="title-dot">.</span></h1><p>We’ll send your message to Sharma General Store. They’ll check every item and ask before guessing.</p></div><AIOrderBox initialText={orderDraft}/><div className="ai-privacy-note"><span>✳</span><p><strong>Made for real-life grocery lists</strong> Say a product name, a quantity, or both. If we need more detail, we’ll ask you before the store confirms your list.</p></div></main></div>
}
