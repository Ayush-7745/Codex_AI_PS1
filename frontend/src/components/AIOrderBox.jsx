import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { products } from '../services/api.js'
import { useCart } from '../context/CartContext.jsx'
import ClarificationBox from './ClarificationBox.jsx'
import StatusTimeline from './StatusTimeline.jsx'

const examples = ['2 kilo atta, ek Amul butter aur aadha kilo sugar, tel bhi chahiye', 'Aadha kilo sugar aur ek Amul butter', '2 litre sunflower oil']
const statusCopy = {
  received: ['Request sent', 'Your store has received the order request.'],
  processing: ['Store is reading your order', 'The store is matching your words to its products.'],
  waiting_customer: ['The store needs one detail', 'Reply below and the store will continue.'],
  unmatched: ['Could not match your request', 'The store needs a little more detail to identify your products.'],
  waiting_store: ['Reply sent to the store', 'They are checking the updated item list.'],
  ready: ['Your list is being reviewed', 'The store has matched the products in your message.'],
  approved: ['Your list is confirmed', 'The store has prepared these items for your cart.'],
  in_cart: ['Items added to your cart', 'Review your basket and confirm checkout.'],
}

export default function AIOrderBox({ initialText = '' }) {
  const { products, deskOrder, submitDeskOrder, updateDeskOrder, clearDeskOrder, addDeskItemsToCart, orderDraft, setOrderDraft } = useCart()
  const [input, setInput] = useState(initialText || orderDraft || '')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [quantityReply, setQuantityReply] = useState('')
  const [quantityError, setQuantityError] = useState('')
  const [detailReply, setDetailReply] = useState('')
  useEffect(() => { if (initialText) setInput(initialText) }, [initialText])
  const sendOrder = (text = input, mode = 'text') => {
    if (!text.trim()) return
    setInput(text); setVoiceError(''); submitDeskOrder(text.trim(), mode); setOrderDraft('')
  }
  const startVoice = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) { setVoiceError('Voice input is not available in this browser. You can type your order instead.'); return }
    const recognition = new Recognition()
    recognition.lang = 'hi-IN'; recognition.interimResults = false
    recognition.onstart = () => { setListening(true); setVoiceError('') }
    recognition.onresult = (event) => { const text = event.results[0][0].transcript; setInput(text); sendOrder(text, 'voice') }
    recognition.onerror = () => { setVoiceError('We could not hear that. Try again or type your order.'); setListening(false) }
    recognition.onend = () => setListening(false)
    recognition.start()
  }
  const options = (deskOrder?.clarification?.options || []).map((id) => products.find((product) => product.id === id)).filter(Boolean)
  const nextClarification = () => {
    const pending = deskOrder.pendingClarifications || []
    return { clarification: pending[0] || null, pendingClarifications: pending.slice(1) }
  }
  const choose = (product) => {
    const requested = deskOrder.clarification?.quantity
    const pending = deskOrder.pendingClarifications || []
    if (requested == null) {
      updateDeskOrder({ status: 'waiting_customer', clarification: { type: 'quantity', productId: product.id, productName: product.name, unit: product.unit, message: `How much ${product.name} would you like? Please tell us the quantity in ${product.unit}.` }, pendingClarifications: pending, customerReply: `I would like ${product.name}.` })
      return
    }
    if (requested > product.stock) {
      updateDeskOrder({ status: 'waiting_customer', clarification: { type: 'stock_exceeded', productId: product.id, productName: product.name, availableStock: product.stock, unit: product.unit, message: `Only ${product.stock} ${product.unit} of ${product.name} is available. Please enter a quantity up to ${product.stock} ${product.unit}.` }, pendingClarifications: pending })
      return
    }
    const items = [...deskOrder.items, { product, quantity: requested }]
    updateDeskOrder({ status: pending.length ? 'waiting_customer' : 'waiting_store', items, clarification: pending[0] || null, pendingClarifications: pending.slice(1), customerReply: `${product.name} · ${requested} ${product.unit}` })
  }
  const sendQuantity = () => {
    const normalizedReply = quantityReply.toLowerCase().trim().replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)))
      .replace(/आधा किलो/g, '0.5 kg').replace(/आधा|अधा/g, '0.5').replace(/डेढ़/g, '1.5').replace(/ढाई/g, '2.5')
      .replace(/एक/g, '1').replace(/दो/g, '2').replace(/तीन/g, '3').replace(/चार/g, '4').replace(/पाँच|पांच/g, '5')
    const found = normalizedReply.match(/(aadha|adha|half|ek|one|do|two|teen|three|four|char|\d+(?:\.\d+)?)/)
    if (!found) { setQuantityError('Enter a quantity such as “2 kg” or “aadha kilo”.'); return }
    const amount = ({ aadha: .5, adha: .5, half: .5, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, four: 4, char: 4 })[found[1]] ?? Number(found[1])
    const clarification = deskOrder.clarification
    const product = products.find((entry) => entry.id === clarification.productId)
    if (!product || !Number.isFinite(amount) || amount <= 0) { setQuantityError('That quantity did not look right. Please try again.'); return }
    if (amount > product.stock) { setQuantityError(`Only ${product.stock} ${product.unit} of ${product.name} is in stock. Enter a quantity up to ${product.stock}.`); return }
    const next = nextClarification()
    updateDeskOrder({ status: next.clarification ? 'waiting_customer' : 'waiting_store', items: [...deskOrder.items, { product, quantity: amount }], ...next, customerReply: `${amount} ${product.unit} of ${product.name}` })
    setQuantityReply(''); setQuantityError('')
  }
  const reset = () => { setInput(''); setOrderDraft(''); clearDeskOrder() }
  const sendDetailRequest = () => { if (detailReply.trim()) { sendOrder(detailReply.trim()); setDetailReply('') } }

  return <section className="ai-order-panel">
    <div className="ai-order-heading"><span className="ai-heading-icon">✳</span><div><span className="eyebrow">YOUR SMART SHOPPING ASSISTANT</span><h2>What should we pick up?</h2><p>Type it or say it. We’ll send it straight to your store.</p></div></div>
    {!deskOrder && <><div className="ai-order-composer"><label htmlFor="ai-order-input">Your grocery list</label><textarea id="ai-order-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Try: 2 kilo atta, ek Amul butter aur aadha kilo sugar, tel bhi chahiye" rows="4"/><div className="ai-composer-footer"><span>Hinglish and English both work</span><div><button type="button" className={`voice-button ${listening ? 'listening' : ''}`} onClick={startVoice} aria-label="Speak your grocery order">{listening ? '● Listening…' : '🎙 Speak'}</button><button type="button" className="primary-button" disabled={!input.trim()} onClick={() => sendOrder()}>Understand order <span>→</span></button></div></div></div>{voiceError && <p className="form-error" role="status">{voiceError}</p>}<div className="example-prompts"><span>Try an example</span>{examples.map((example) => <button key={example} onClick={() => setInput(example)}>{example}</button>)}</div></>}
    {deskOrder && <div className="desk-order-state"><div className="desk-state-heading"><span className="desk-status-icon">{deskOrder.status === 'waiting_customer' ? '?' : ['approved', 'in_cart'].includes(deskOrder.status) ? '✓' : '✳'}</span><div><strong>{statusCopy[deskOrder.status]?.[0] || 'Order in progress'}</strong><p>{statusCopy[deskOrder.status]?.[1]}</p></div><span className="request-tag">{deskOrder.inputMode === 'voice' ? 'VOICE' : 'TYPED'} · {deskOrder.id}</span></div><div className="customer-original"><span>YOUR MESSAGE</span><p>“{deskOrder.text}”</p></div>
      {['received', 'processing'].includes(deskOrder.status) && <div className="ai-reading-state"><span className="small-spinner"/><span>The store is reading your order and matching products…</span></div>}
      {deskOrder.status !== 'received' && deskOrder.status !== 'processing' && <><h3 className="ai-result-title">AI understood your order</h3>{deskOrder.items?.length > 0 ? <div className="interpreted-list">{deskOrder.items.map(({ product, quantity }, index) => <div className="interpreted-item" key={`${product.id}-${index}`}><span className="interpreted-check">✓</span><span className="interpreted-emoji">{product.emoji}</span><strong>{product.name}</strong><span className="interpreted-qty">{quantity} {product.unit}</span><span className="interpreted-price">₹{product.price * quantity}</span></div>)}</div> : <p className="no-match">The store is checking your request.</p>}</>}
      {deskOrder.status === 'waiting_customer' && deskOrder.clarification && deskOrder.clarification.type !== 'request_detail' && <ClarificationBox message={deskOrder.clarification.message} options={options} onSelect={choose} quantity={deskOrder.clarification.type === 'quantity'} value={quantityReply} onChange={(value) => { setQuantityReply(value); setQuantityError('') }} onSubmit={sendQuantity} error={quantityError}/>}
      {deskOrder.status === 'waiting_customer' && deskOrder.clarification?.type === 'request_detail' && <div className="customer-detail-reply"><p>{deskOrder.clarification.message}</p><textarea aria-label="Updated grocery request" value={detailReply} onChange={event => setDetailReply(event.target.value)} placeholder="Type the product name and quantity"/><button type="button" className="primary-button" disabled={!detailReply.trim()} onClick={sendDetailRequest}>Send new request <span>→</span></button></div>}
      {deskOrder.customerReply && <p className="reply-sent">✓ &nbsp;You replied: {deskOrder.customerReply}</p>}
      <StatusTimeline status={deskOrder.status} variant="request"/>
      {deskOrder.status === 'approved' && <button className="primary-button add-order-button customer-cart-button" onClick={addDeskItemsToCart}>Add all to cart <span>→</span></button>}
      {deskOrder.status === 'in_cart' && <div className="customer-next-step"><span>✓ Items are in your cart.</span><Link to="/customer/cart">Review cart →</Link></div>}
      <button className="new-request-button" onClick={reset}>Start a new request</button>
    </div>}
  </section>
}
