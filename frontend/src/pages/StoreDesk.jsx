import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar.jsx'
import { useCart } from '../context/CartContext.jsx'
import { parseOrder } from '../services/api.js'

const labels = {
  received: 'New request', processing: 'Reading order', waiting_customer: 'Waiting on customer',
  waiting_store: 'Customer replied', ready: 'Ready to review', approved: 'Store confirmed', in_cart: 'Added to cart',
  preparing: 'Preparing', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered',
}
const placedStatusLabels = { received: 'New order', preparing: 'Preparing', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered' }
const money = (items = []) => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

export default function StoreDesk() {
  const { deskOrder, updateDeskOrder, clearDeskOrder, placedOrders, updatePlacedOrder } = useCart()
  const [error, setError] = useState('')
  useEffect(() => {
    if (!deskOrder || !['received', 'processing'].includes(deskOrder.status)) return
    let active = true
    updateDeskOrder({ status: 'processing' })
    parseOrder(deskOrder.text).then((result) => {
      if (!active) return
      const clarifications = result.clarifications || (result.clarification ? [result.clarification] : [])
      updateDeskOrder({ items: result.items || [], clarification: clarifications[0] || null, pendingClarifications: clarifications.slice(1), status: clarifications.length ? 'waiting_customer' : 'ready', customerReply: null })
    }).catch(() => setError('We could not read this request. Please ask the customer to send it again.'))
    return () => { active = false }
  }, [deskOrder?.id, deskOrder?.status])

  const confirmItems = () => {
    if (!deskOrder?.items?.length) { setError('There are no matched items to confirm yet. Ask the customer to clarify their request.'); return }
    setError(''); updateDeskOrder({ status: 'approved', clarification: null })
  }
  const moveOrderForward = (order) => {
    const nextStatus = { received: 'preparing', preparing: 'packed', packed: 'out_for_delivery', out_for_delivery: 'delivered' }[order.status]
    if (nextStatus) updatePlacedOrder(order.order_id, { status: nextStatus, updated_at: new Date().toISOString() })
  }
  return <div className="app-shell"><Navbar/><main className="page-width merchant-page"><div className="breadcrumbs"><span>Sharma General Store</span><span>/</span><span>Store desk</span></div><div className="merchant-heading"><div><span className="eyebrow">SHARMA GENERAL STORE · TEAM VIEW</span><h1>Store order desk<span className="title-dot">.</span></h1><p>Customer requests arrive here. AI extracts the items and flags anything unclear.</p></div><div className="merchant-live"><i/> LIVE INBOX</div></div>
    <div className="merchant-summary"><div className="merchant-store-icon">🏪</div><div><strong>Sharma General Store</strong><span>Single-store order inbox</span></div><div className="merchant-summary-divider"/><div><strong>{String(placedOrders.filter((order) => order.status !== 'delivered').length + (deskOrder ? 1 : 0)).padStart(2, '0')}</strong><span>Active order(s)</span></div><div className="merchant-summary-divider"/><div><strong>20–30 min</strong><span>Typical delivery</span></div></div>
    <div className="inbox-section-heading"><div><span className="eyebrow">INCOMING MESSAGES</span><h2>Customer inbox</h2></div><span className="inbox-count">{deskOrder ? '1 REQUEST' : placedOrders.length ? `${placedOrders.length} ORDER${placedOrders.length === 1 ? '' : 'S'}` : 'ALL CAUGHT UP'}</span></div>
    {deskOrder ? <article className="request-card"><div className="request-card-top"><div className="request-customer"><span className="customer-avatar">{deskOrder.inputMode === 'voice' ? '🎙' : '👤'}</span><div><strong>Store customer</strong><span>{deskOrder.inputMode === 'voice' ? 'Voice message' : 'Typed message'} · Just now</span></div></div><span className={`request-status status-${deskOrder.status}`}>{labels[deskOrder.status] || 'In progress'}</span></div>
      <div className="customer-message-panel"><span>{deskOrder.inputMode === 'voice' ? '🎙 CUSTOMER VOICE MESSAGE' : 'CUSTOMER MESSAGE'}</span><p>“{deskOrder.text}”</p></div>
      <div className="extraction-header"><div><span className="extraction-spark">✳</span><div><h3>AI order extraction</h3><p>Matched against Sharma General Store products</p></div></div>{deskOrder.status === 'processing' || deskOrder.status === 'received' ? <span className="extracting"><i/> Extracting…</span> : <span className="extracted-label">✓ EXTRACTED</span>}</div>
      {deskOrder.status === 'processing' || deskOrder.status === 'received' ? <div className="extraction-loading"><span className="spinner dark-spinner"/> Matching the customer’s words to store products…</div> : <>
        {deskOrder.items?.length ? <div className="merchant-items">{deskOrder.items.map(({ product, quantity }, index) => <div className="merchant-item" key={`${product.id}-${index}`}><span className="merchant-item-emoji">{product.emoji}</span><div><strong>{product.name}</strong><span>{quantity} {product.unit} × ₹{product.price}</span></div><b>₹{quantity * product.price}</b></div>)}</div> : deskOrder.clarification?.type === 'quantity' ? <div className="merchant-no-match">Waiting for the customer to tell us how much {deskOrder.clarification.productName} they want.</div> : <div className="merchant-no-match">No products matched yet. The customer’s original message is above; you can ask them to send a little more detail.</div>}
        {deskOrder.status === 'waiting_customer' && <div className="merchant-clarification"><span className="clarification-warning">?</span><div><strong>Clarification sent to customer</strong><p>{deskOrder.clarification?.message || 'Waiting for the customer to choose a product.'}</p><span className="merchant-waiting"><i/> Waiting for their reply</span></div></div>}
        {deskOrder.status === 'waiting_store' && <div className="merchant-reply"><span>✓</span><div><strong>Customer replied</strong><p>{deskOrder.customerReply}. Review the updated list and confirm it for the customer.</p></div></div>}
        {deskOrder.status === 'ready' && <div className="merchant-ready"><span>✓</span><div><strong>Products matched</strong><p>No ambiguous items found. Confirm the extracted list to send it to the customer.</p></div></div>}
        {deskOrder.status === 'approved' && <div className="merchant-ready"><span>✓</span><div><strong>Order prepared for the customer</strong><p>They can now add these items to their cart and check out.</p></div></div>}
        {deskOrder.status === 'in_cart' && <div className="merchant-ready"><span>✓</span><div><strong>Customer added the order to their cart</strong><p>They are reviewing the order before confirmation.</p></div></div>}
        {deskOrder.items?.length > 0 && <div className="merchant-total"><span>Extracted items subtotal</span><strong>₹{money(deskOrder.items)}</strong></div>}
      </>}
      {error && <p className="merchant-error">{error}</p>}
      {['ready', 'waiting_store'].includes(deskOrder.status) && <div className="merchant-actions"><p>Confirming sends the prepared items back to the customer.</p><button className="primary-button" onClick={confirmItems}>Confirm items for customer <span>→</span></button></div>}
      <div className="request-card-footer"><span>Request {deskOrder.id}</span><button onClick={clearDeskOrder}>Clear inbox request</button></div>
    </article> : <section className="inbox-empty"><div>✉</div><h2>{placedOrders.length ? 'No pending customer messages' : 'No customer requests yet'}</h2><p>{placedOrders.length ? 'New messages that need product clarification will appear here. Confirmed checkouts are listed below.' : 'Send an order from the customer shop and it will show up here automatically.'}</p>{!placedOrders.length && <a href="/store">Open customer shop →</a>}</section>}
    {placedOrders.length > 0 && <section className="placed-orders-section"><div className="inbox-section-heading"><div><span className="eyebrow">CHECKOUT CONFIRMATIONS</span><h2>Placed orders <span className="placed-count">{placedOrders.length}</span></h2></div><span className="inbox-count">LIVE UPDATES</span></div><div className="placed-orders-list">{placedOrders.map((order) => <article className="placed-order-card" key={order.order_id}><div className="placed-order-top"><div><strong>#{order.order_id}</strong><span>{order.placed_at ? new Date(order.placed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Just placed'}</span></div><span className={`request-status status-${order.status}`}>{placedStatusLabels[order.status] || order.status}</span></div>{order.sourceMessage && <p className="placed-order-message">Customer message: “{order.sourceMessage}”</p>}<div className="placed-order-items">{order.items.map(({ product, quantity }, index) => <div key={`${product.id}-${index}`}><span>{product.emoji} &nbsp;{product.name}</span><span>{quantity} {product.unit}</span><strong>₹{product.price * quantity}</strong></div>)}</div><div className="placed-order-bottom"><span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} items · Order total</span><strong>₹{order.total}</strong></div>{order.status !== 'delivered' && <button className="order-progress-button" onClick={() => moveOrderForward(order)}>{({ received: 'Start preparing', preparing: 'Mark packed', packed: 'Send for delivery', out_for_delivery: 'Mark delivered' })[order.status] || 'Update order'} <span>→</span></button>}</article>)}</div></section>}
    <div className="merchant-flow-note"><span>✳</span><p><strong>How this inbox works</strong> Customer messages are matched to products. If “tel” could mean more than one oil, the customer gets a question before the order is confirmed.</p></div>
    </main></div>
}
