import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import StatusBadge from '../../components/StatusBadge.jsx'
import { useCart } from '../../context/CartContext.jsx'
import { parseOrder, mockParseOrder, getLiveProducts } from '../../services/api.js'

const deskLabels = {
  received: 'New request', processing: 'Reading order', waiting_customer: 'Waiting on customer', unmatched: 'Could not match any product',
  waiting_store: 'Customer replied', ready: 'Ready to review', approved: 'Store confirmed', in_cart: 'Added to cart',
  preparing: 'Preparing', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', error: 'Could not read order'
}

const money = (items = []) => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

export default function Orders() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { products, deskOrder, updateDeskOrder, clearDeskOrder, placedOrders, updatePlacedOrder } = useCart()
  const [parseError, setParseError] = useState('')
  const [actionError, setActionError] = useState('')

  // Determine active tab reactively from search params or presence of active deskOrder
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam ? (tabParam === 'requests' ? 'requests' : 'placed') : (deskOrder ? 'requests' : 'placed')

  const switchTab = (tabKey) => {
    setSearchParams({ tab: tabKey })
  }

  // Parse AI order function (StrictMode safe, try/catch wrapped with fallback)
  const handleParseOrder = async (orderToParse) => {
    if (!orderToParse || !orderToParse.text) return
    const catalog = (products && products.length) ? products : getLiveProducts()

    setParseError('')
    setActionError('')
    updateDeskOrder({ text: orderToParse.text, status: 'processing', parseError: null })

    let result = null
    try {
      result = await parseOrder(orderToParse.text, catalog)
    } catch (err) {
      console.warn('Backend parse API failed, falling back to local mock parser:', err)
      try {
        result = mockParseOrder(orderToParse.text, catalog)
      } catch (mockErr) {
        console.error('Mock parser error:', mockErr)
      }
    }

    if (!result) {
      try {
        result = mockParseOrder(orderToParse.text, catalog)
      } catch (e) {
        result = null
      }
    }

    if (result) {
      const clarifications = result.clarifications || (result.clarification ? [result.clarification] : [])
      const nextStatus = clarifications.length ? 'waiting_customer' : result.items?.length ? 'ready' : 'unmatched'

      updateDeskOrder({
        items: result.items || [],
        clarification: clarifications[0] || null,
        pendingClarifications: clarifications.slice(1),
        status: nextStatus,
        customerReply: null,
        parseError: null,
        correctionText: orderToParse.correctionText || orderToParse.text
      })
    } else {
      setParseError('Could not read this order. Please try again.')
      updateDeskOrder({
        status: 'error',
        parseError: 'Could not read this order. Please try again.'
      })
    }
  }

  // Automatically parse request on load or when status is received/processing/error without items/clarification
  useEffect(() => {
    if (!deskOrder || !deskOrder.text) return
    if (['received', 'processing', 'error'].includes(deskOrder.status) && (!deskOrder.items || !deskOrder.items.length) && !deskOrder.clarification) {
      handleParseOrder(deskOrder)
    }
  }, [deskOrder?.id, deskOrder?.status, products])

  const confirmItems = () => {
    if (!deskOrder?.items?.length) {
      setActionError('There are no matched items to confirm yet. Ask the customer to clarify their request.')
      return
    }
    setActionError('')
    updateDeskOrder({ status: 'approved', clarification: null })
  }

  const moveOrderForward = (order) => {
    const nextStatus = { received: 'preparing', preparing: 'packed', packed: 'out_for_delivery', out_for_delivery: 'delivered' }[order.status]
    if (nextStatus) updatePlacedOrder(order.order_id, { status: nextStatus, updated_at: new Date().toISOString() })
  }

  return <div className="app-shell">
    <Navbar/>
    <main className="page-width merchant-page">
      <div className="breadcrumbs">
        <span>Sharma General Store</span>
        <span className="crumb-separator">/</span>
        <span className="crumb-current">Orders & AI Desk</span>
      </div>

      <div className="merchant-heading">
        <div>
          <span className="eyebrow">SHARMA GENERAL STORE · TEAM VIEW</span>
          <h1>Store Orders Desk<span className="title-dot">.</span></h1>
          <p>Review incoming customer AI requests and manage active placed orders.</p>
        </div>
        <div className="merchant-live"><i/> LIVE INBOX</div>
      </div>

      <div className="merchant-summary">
        <div className="merchant-store-icon">🏪</div>
        <div className="merchant-summary-item">
          <strong>Sharma General Store</strong>
          <span>Single-store order inbox</span>
        </div>
        <div className="merchant-summary-divider"/>
        <div className="merchant-summary-item">
          <strong className="summary-stat">{String(placedOrders.filter((order) => order.status !== 'delivered').length + (deskOrder ? 1 : 0)).padStart(2, '0')}</strong>
          <span>Active order(s)</span>
        </div>
        <div className="merchant-summary-divider"/>
        <div className="merchant-summary-item">
          <strong>20–30 min</strong>
          <span>Typical delivery</span>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="store-tabs-row">
        <button type="button" className={`tab-button ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => switchTab('requests')}>
          <span>✳ AI Requests</span>
          {deskOrder && <span className="tab-badge">1</span>}
        </button>
        <button type="button" className={`tab-button ${activeTab === 'placed' ? 'active' : ''}`} onClick={() => switchTab('placed')}>
          <span>📦 Placed Orders</span>
          {placedOrders.length > 0 && <span className="tab-badge">{placedOrders.length}</span>}
        </button>
      </div>

      {/* TAB 1: AI REQUESTS INBOX */}
      {activeTab === 'requests' && (
        <section className="tab-section">
          <div className="inbox-section-heading">
            <div>
              <span className="eyebrow">INCOMING MESSAGES</span>
              <h2>Customer inbox</h2>
            </div>
            <span className="inbox-count">{deskOrder ? '1 REQUEST' : placedOrders.length ? `${placedOrders.length} ORDER${placedOrders.length === 1 ? '' : 'S'}` : 'ALL CAUGHT UP'}</span>
          </div>

          {deskOrder ? (
            <article className="request-card">
              <div className="request-card-top">
                <div className="request-customer">
                  <span className="customer-avatar">{deskOrder.inputMode === 'voice' ? '🎙' : '👤'}</span>
                  <div>
                    <strong>Store customer</strong>
                    <span>{deskOrder.inputMode === 'voice' ? 'Voice message' : 'Typed message'} · Just now</span>
                  </div>
                </div>
                <span className={`request-status status-${deskOrder.status}`}>{deskLabels[deskOrder.status] || 'In progress'}</span>
              </div>

              <div className="customer-message-panel">
                <span>{deskOrder.inputMode === 'voice' ? '🎙 CUSTOMER VOICE MESSAGE' : 'CUSTOMER MESSAGE'}</span>
                <p>“{deskOrder.text}”</p>
              </div>

              <div className="extraction-header">
                <div>
                  <span className="extraction-spark">✳</span>
                  <div>
                    <h3>AI order extraction</h3>
                    <p>Matched against Sharma General Store products</p>
                  </div>
                </div>
                {deskOrder.status === 'processing' || deskOrder.status === 'received' ? (
                  <span className="extracting"><i/> Extracting…</span>
                ) : (
                  <span className="extracted-label">✓ EXTRACTED</span>
                )}
              </div>

              {deskOrder.status === 'processing' || deskOrder.status === 'received' ? (
                <div className="ai-reading-state">
                  <span className="small-spinner"/>
                  <span>Matching the customer’s words to store products…</span>
                </div>
              ) : (
                <>
                  {deskOrder.status === 'error' || deskOrder.parseError ? (
                    <div className="merchant-clarification">
                      <span className="clarification-warning">!</span>
                      <div>
                        <strong>Could not read this order</strong>
                        <p>{deskOrder.parseError || parseError || 'An error occurred while parsing the order.'}</p>
                        <button type="button" className="secondary-button compact-btn" onClick={() => handleParseOrder(deskOrder)}>Retry</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {deskOrder.items?.length ? (
                        <div className="merchant-items">
                          {deskOrder.items.map(({ product, quantity }, index) => (
                            <div className="merchant-item" key={`${product.id}-${index}`}>
                              <span className="merchant-item-emoji">{product.emoji || '📦'}</span>
                              <div>
                                <strong>{product.name}</strong>
                                <span>{quantity} {product.unit} × ₹{product.price}</span>
                              </div>
                              <b>₹{quantity * product.price}</b>
                            </div>
                          ))}
                        </div>
                      ) : deskOrder.clarification?.type === 'quantity' ? (
                        <div className="merchant-no-match">Waiting for the customer to tell us how much {deskOrder.clarification.productName} they want.</div>
                      ) : deskOrder.clarification?.type === 'stock_exceeded' ? (
                        <div className="merchant-no-match">Stock limit reached for {deskOrder.clarification.productName} ({deskOrder.clarification.availableStock} in stock). Waiting for customer to adjust quantity.</div>
                      ) : deskOrder.status === 'unmatched' ? (
                        <div className="merchant-clarification unmatched-request">
                          <span className="clarification-warning">!</span>
                          <div>
                            <strong>Could not match any product</strong>
                            <p>Edit the message and try matching it again, or ask the customer for more detail.</p>
                            <textarea aria-label="Correct customer message" value={deskOrder.correctionText ?? deskOrder.text} onChange={event => updateDeskOrder({ correctionText: event.target.value })}/>
                            <div className="unmatched-actions">
                              <button type="button" className="secondary-button compact-btn" onClick={() => handleParseOrder({ ...deskOrder, text: deskOrder.correctionText ?? deskOrder.text })}>Re-parse</button>
                              <button type="button" className="secondary-button compact-btn" onClick={() => updateDeskOrder({ status: 'waiting_customer', clarification: { type: 'request_detail', message: 'Please tell us the product name and quantity' } })}>Ask customer for more detail</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="merchant-no-match">No products matched yet. The customer’s original message is above; you can ask them to send a little more detail.</div>
                      )}

                      {deskOrder.status === 'waiting_customer' && (
                        <div className="merchant-clarification">
                          <span className="clarification-warning">?</span>
                          <div>
                            <strong>Clarification sent to customer</strong>
                            <p>{deskOrder.clarification?.message || 'Waiting for the customer to choose a product.'}</p>
                            <span className="merchant-waiting"><i/> Waiting for their reply</span>
                          </div>
                        </div>
                      )}

                      {deskOrder.status === 'waiting_store' && (
                        <div className="merchant-reply">
                          <span>✓</span>
                          <div>
                            <strong>Customer replied</strong>
                            <p>{deskOrder.customerReply}. Review the updated list and confirm it for the customer.</p>
                          </div>
                        </div>
                      )}

                      {deskOrder.status === 'ready' && (
                        <div className="merchant-ready">
                          <span>✓</span>
                          <div>
                            <strong>Products matched</strong>
                            <p>No ambiguous items found. Confirm the extracted list to send it to the customer.</p>
                          </div>
                        </div>
                      )}

                      {deskOrder.status === 'approved' && (
                        <div className="merchant-ready">
                          <span>✓</span>
                          <div>
                            <strong>Order prepared for the customer</strong>
                            <p>They can now add these items to their cart and check out.</p>
                          </div>
                        </div>
                      )}

                      {deskOrder.status === 'in_cart' && (
                        <div className="merchant-ready">
                          <span>✓</span>
                          <div>
                            <strong>Customer added the order to their cart</strong>
                            <p>They are reviewing the order before confirmation.</p>
                          </div>
                        </div>
                      )}

                      {deskOrder.items?.length > 0 && (
                        <div className="merchant-total">
                          <span>Extracted items subtotal</span>
                          <strong>₹{money(deskOrder.items)}</strong>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {actionError && <p className="merchant-error">{actionError}</p>}
              {['ready', 'waiting_store'].includes(deskOrder.status) && (
                <div className="merchant-actions">
                  <p>Confirming sends the prepared items back to the customer.</p>
                  <button type="button" className="primary-button" onClick={confirmItems}>Confirm items for customer <span>→</span></button>
                </div>
              )}

              <div className="request-card-footer">
                <span>Request {deskOrder.id}</span>
                <button type="button" className="clear-request-button" onClick={clearDeskOrder}>Clear inbox request</button>
              </div>
            </article>
          ) : (
            <section className="inbox-empty">
              <div>✉</div>
              <h2>{placedOrders.length ? 'No pending customer messages' : 'No customer requests yet'}</h2>
              <p>{placedOrders.length ? 'New messages that need product clarification will appear here. Confirmed checkouts are listed below.' : 'Send an order from the customer shop and it will show up here automatically.'}</p>
            </section>
          )}
        </section>
      )}

      {/* TAB 2: PLACED ORDERS LIST */}
      {activeTab === 'placed' && (
        <section className="tab-section">
          <div className="inbox-section-heading">
            <div>
              <span className="eyebrow">CHECKOUT CONFIRMATIONS</span>
              <h2>Placed Orders <span className="placed-count">{placedOrders.length}</span></h2>
            </div>
            <span className="inbox-count">LIVE STATUS SYNCHRONIZATION</span>
          </div>

          {placedOrders.length > 0 ? (
            <div className="placed-orders-list">
              {placedOrders.map((order) => (
                <article className="placed-order-card" key={order.order_id}>
                  <div className="placed-order-header">
                    <div className="placed-order-meta">
                      <div className="placed-order-title-row">
                        <span className="order-id-badge">#{order.order_id}</span>
                        <span className="customer-name-tag">👤 {order.customerName || 'Store customer'}</span>
                      </div>
                      <span className="placed-timestamp">
                        {order.placed_at ? new Date(order.placed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently placed'}
                      </span>
                    </div>
                    <StatusBadge status={order.status}/>
                  </div>

                  {order.sourceMessage && (
                    <div className="placed-order-note">
                      <span className="note-label">CUSTOMER NOTE:</span>
                      <p>“{order.sourceMessage}”</p>
                    </div>
                  )}

                  <div className="placed-order-items-list">
                    {order.items.map(({ product, quantity }, index) => (
                      <div className="placed-item-row" key={`${product.id}-${index}`}>
                        <div className="placed-item-info">
                          <span className="placed-item-emoji">{product.emoji || '📦'}</span>
                          <span className="placed-item-name">{product.name}</span>
                        </div>
                        <span className="placed-item-qty">{quantity} {product.unit}</span>
                        <strong className="placed-item-price">₹{product.price * quantity}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="placed-order-summary-row">
                    <span className="placed-items-count">
                      {order.items.reduce((sum, item) => sum + item.quantity, 0)} {order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? 'item' : 'items'}
                    </span>
                    <div className="placed-total-display">
                      <span>Total:</span>
                      <strong>₹{order.total}</strong>
                    </div>
                  </div>

                  <div className="placed-card-actions">
                    {order.status !== 'delivered' && (
                      <button type="button" className="primary-button order-advance-btn" onClick={() => moveOrderForward(order)}>
                        <span>{({ received: 'Start preparing', preparing: 'Mark packed', packed: 'Send for delivery', out_for_delivery: 'Mark delivered' })[order.status] || 'Advance status'}</span>
                        <span>→</span>
                      </button>
                    )}
                    <Link className="secondary-button order-detail-link" to={`/store/orders/${order.order_id}`}>
                      View Details & Stepper <span>→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="inbox-empty">
              <div>📦</div>
              <h2>No confirmed orders placed yet</h2>
              <p>When customers check out their cart, their order will be listed here.</p>
            </section>
          )}
        </section>
      )}
    </main>
  </div>
}
