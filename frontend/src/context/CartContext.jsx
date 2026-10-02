import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { products as defaultProducts } from '../services/api.js'
import { useAuth } from './AuthContext.jsx'

const CartContext = createContext(null)
const CART_KEY = 'ai-order-cart'
const REQUEST_KEY = 'ai-order-desk-request'
const ORDERS_KEY = 'ai-order-confirmed-orders'
const DRAFT_KEY = 'ai-order-draft-text'
const PRODUCTS_KEY = 'ai-order-products'
const CATALOG_VERSION_KEY = 'ai-order-catalog-version'
const CURRENT_CATALOG_VERSION = '1.1'

let channelInstance = null
function getChannel() {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window && !channelInstance) {
    try {
      channelInstance = new BroadcastChannel('ai-order-desk-sync')
    } catch {
      channelInstance = null
    }
  }
  return channelInstance
}

function broadcastSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error('localStorage write error:', err)
  }
  const channel = getChannel()
  if (channel) {
    try {
      channel.postMessage({ key, value })
    } catch {
      try {
        channelInstance = new BroadcastChannel('ai-order-desk-sync')
        channelInstance.postMessage({ key, value })
      } catch (err) {
        console.error('BroadcastChannel postMessage error:', err)
      }
    }
  }
}

const read = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key)
    return saved === null ? fallback : JSON.parse(saved)
  } catch {
    return fallback
  }
}

const initProducts = () => {
  try {
    const version = localStorage.getItem(CATALOG_VERSION_KEY)
    if (version === CURRENT_CATALOG_VERSION) {
      const saved = localStorage.getItem(PRODUCTS_KEY)
      if (saved) return JSON.parse(saved)
    }
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(defaultProducts))
    localStorage.setItem(CATALOG_VERSION_KEY, CURRENT_CATALOG_VERSION)
    return defaultProducts
  } catch {
    return defaultProducts
  }
}

export function CartProvider({ children }) {
  const { user } = useAuth()
  const [products, setProducts] = useState(initProducts)
  const [items, setItems] = useState(() => read(CART_KEY, []))
  const [deskOrder, setDeskOrder] = useState(() => read(REQUEST_KEY, null))
  const [placedOrders, setPlacedOrders] = useState(() => read(ORDERS_KEY, []))
  const [orderDraft, setOrderDraftState] = useState(() => read(DRAFT_KEY, ''))
  const [cartRemovedToast, setCartRemovedToast] = useState('')
  const processedOrdersRef = useRef(new Set())

  useEffect(() => {
    const channel = getChannel()
    if (channel) {
      channel.onmessage = ({ data }) => {
        if (!data || !data.key) return
        if (data.key === PRODUCTS_KEY) setProducts(data.value || [])
        if (data.key === CART_KEY) setItems(data.value || [])
        if (data.key === REQUEST_KEY) setDeskOrder(data.value || null)
        if (data.key === ORDERS_KEY) setPlacedOrders(data.value || [])
        if (data.key === DRAFT_KEY) setOrderDraftState(data.value || '')
      }
    }

    const onStorage = (event) => {
      if (event.key === PRODUCTS_KEY) setProducts(read(PRODUCTS_KEY, []))
      if (event.key === CART_KEY) setItems(read(CART_KEY, []))
      if (event.key === REQUEST_KEY) setDeskOrder(read(REQUEST_KEY, null))
      if (event.key === ORDERS_KEY) setPlacedOrders(read(ORDERS_KEY, []))
      if (event.key === DRAFT_KEY) setOrderDraftState(read(DRAFT_KEY, ''))
    }

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      // Note: We never close channelInstance here so the sending channel remains open and active
    }
  }, [])

  // Sync cart items if a product is deleted or stock changes below item quantity
  useEffect(() => {
    let changed = false
    const validItems = items.filter(item => {
      const exists = products.some(p => p.id === item.product.id)
      if (!exists) {
        changed = true
        return false
      }
      return true
    })
    if (changed) {
      setItems(validItems)
      broadcastSave(CART_KEY, validItems)
      setCartRemovedToast('An item in your cart was removed because it is no longer in the catalog.')
    }
  }, [products])

  const setOrderDraft = (value) => {
    setOrderDraftState(value)
    broadcastSave(DRAFT_KEY, value)
  }

  const updateCart = (next) => {
    setItems(next)
    broadcastSave(CART_KEY, next)
  }

  const addItem = (product, quantity = 1) => {
    const liveProduct = products.find(p => p.id === product.id) || product
    if (liveProduct.stock <= 0) {
      return { success: false, error: `${liveProduct.name} is currently out of stock.` }
    }
    const existing = items.find((item) => item.product.id === product.id)
    const currentQty = existing ? existing.quantity : 0
    const desired = currentQty + quantity

    if (desired > liveProduct.stock) {
      const maxAdd = liveProduct.stock - currentQty
      if (maxAdd <= 0) {
        return { success: false, error: `Cannot add more. Only ${liveProduct.stock} in stock.` }
      }
      updateCart(items.map(item => item.product.id === product.id ? { ...item, quantity: liveProduct.stock } : item))
      return { success: true, warning: `Quantity capped at available stock (${liveProduct.stock}).` }
    }

    const next = existing
      ? items.map((item) => item.product.id === product.id ? { ...item, quantity: desired } : item)
      : [...items, { product: liveProduct, quantity: desired }]
    updateCart(next)
    return { success: true }
  }

  const setQuantity = (id, quantity) => {
    if (quantity <= 0) {
      updateCart(items.filter((item) => item.product.id !== id))
      return
    }
    const liveProduct = products.find(p => p.id === id)
    const maxQty = liveProduct ? liveProduct.stock : quantity
    const safeQty = Math.min(quantity, maxQty)
    updateCart(items.map((item) => item.product.id === id ? { ...item, quantity: safeQty } : item))
  }

  const removeItem = (id) => updateCart(items.filter((item) => item.product.id !== id))
  const clearCart = () => updateCart([])

  // Products CRUD Operations
  const addProduct = (productData) => {
    const newId = `prod-${Date.now()}`
    const categoryColors = { 'Atta & Rice': 'sand', Oil: 'orange', Dairy: 'blue', Snacks: 'gold', Beverages: 'sand' }
    const categoryEmojis = { 'Atta & Rice': '🌾', Oil: '🫙', Dairy: '🥛', Snacks: '🍪', Beverages: '🍵' }
    const cat = productData.category || 'Atta & Rice'
    const newProduct = {
      id: newId,
      name: productData.name.trim(),
      brand: productData.brand?.trim() || '',
      category: cat,
      price: Math.max(0, Number(productData.price) || 0),
      unit: productData.unit || 'kg',
      stock: Math.max(0, Number(productData.stock) || 0),
      keywords: typeof productData.keywords === 'string'
        ? productData.keywords.split(',').map(k => k.trim()).filter(Boolean)
        : (productData.keywords || []),
      emoji: productData.emoji || categoryEmojis[cat] || '📦',
      color: productData.color || categoryColors[cat] || 'sand'
    }
    const next = [newProduct, ...products]
    setProducts(next)
    broadcastSave(PRODUCTS_KEY, next)
    return newProduct
  }

  const updateProduct = (id, patch) => {
    const next = products.map(p => {
      if (p.id !== id) return p
      const price = patch.price != null ? Math.max(0, Number(patch.price) || 0) : p.price
      const stock = patch.stock != null ? Math.max(0, Number(patch.stock) || 0) : p.stock
      const keywords = typeof patch.keywords === 'string'
        ? patch.keywords.split(',').map(k => k.trim()).filter(Boolean)
        : (patch.keywords != null ? patch.keywords : p.keywords)
      return { ...p, ...patch, price, stock, keywords }
    })
    setProducts(next)
    broadcastSave(PRODUCTS_KEY, next)
  }

  const updateProductStock = (id, newStock) => {
    const safeStock = Math.max(0, Number(newStock) || 0)
    updateProduct(id, { stock: safeStock })
  }

  const deleteProduct = (id) => {
    const deletedProduct = products.find(p => p.id === id)
    const nextProds = products.filter(p => p.id !== id)
    setProducts(nextProds)
    broadcastSave(PRODUCTS_KEY, nextProds)

    // Remove from active cart if present
    if (items.some(item => item.product.id === id)) {
      const nextItems = items.filter(item => item.product.id !== id)
      updateCart(nextItems)
      setCartRemovedToast(`"${deletedProduct?.name || 'A product'}" was deleted from store and removed from your cart.`)
    }
  }

  const saveDeskOrder = (next) => {
    setDeskOrder(next)
    broadcastSave(REQUEST_KEY, next)
  }

  const submitDeskOrder = (text, inputMode = 'text') => {
    saveDeskOrder({ id: `REQ-${Date.now()}`, text, inputMode, status: 'received', items: [], clarification: null, sentAt: new Date().toISOString() })
  }

  const updateDeskOrder = (patch) => {
    if (deskOrder) saveDeskOrder({ ...deskOrder, ...patch })
  }

  const clearDeskOrder = () => {
    setDeskOrder(null)
    localStorage.removeItem(REQUEST_KEY)
    getChannel()?.postMessage({ key: REQUEST_KEY, value: null })
  }

  const addDeskItemsToCart = () => {
    if (!deskOrder || deskOrder.status !== 'approved') return
    const next = [...items]
    deskOrder.items.forEach(({ product, quantity }) => {
      const liveProd = products.find(p => p.id === product.id) || product
      if (liveProd.stock <= 0) return
      const validQty = Math.min(quantity, liveProd.stock)
      const existing = next.find((item) => item.product.id === liveProd.id)
      if (existing) existing.quantity = Math.min(existing.quantity + validQty, liveProd.stock)
      else next.push({ product: liveProd, quantity: validQty })
    })
    updateCart(next)
    updateDeskOrder({ status: 'in_cart' })
  }

  const publishConfirmedOrder = (order, orderItems) => {
    const orderId = String(order.order_id || order.id || `ORD${Date.now()}`)
    const createdAt = new Date().toISOString()
    const customerName = user?.name || order.customerName || 'Store customer'

    // Decrement product stock strictly ONCE during customer checkout
    let nextProducts = products
    if (!processedOrdersRef.current.has(orderId)) {
      processedOrdersRef.current.add(orderId)
      nextProducts = products.map(p => {
        const item = orderItems.find(i => i.product.id === p.id)
        if (item) {
          return { ...p, stock: Math.max(0, p.stock - item.quantity) }
        }
        return p
      })
      setProducts(nextProducts)
      broadcastSave(PRODUCTS_KEY, nextProducts)
    }

    const confirmed = {
      order_id: orderId,
      customerName,
      createdAt,
      placed_at: createdAt,
      items: orderItems.map((item) => ({ ...item })),
      total: order.total ?? orderItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0) + 20,
      status: 'received',
      sourceMessage: deskOrder?.status === 'in_cart' ? deskOrder.text : '',
    }
    const nextOrders = [confirmed, ...placedOrders.filter((entry) => String(entry.order_id) !== orderId)]
    setPlacedOrders(nextOrders)
    broadcastSave(ORDERS_KEY, nextOrders)

    if (deskOrder?.status === 'in_cart') clearDeskOrder()
    return confirmed
  }

  const updatePlacedOrder = (orderId, patch) => {
    const next = placedOrders.map((order) => String(order.order_id) === String(orderId) ? { ...order, ...patch } : order)
    setPlacedOrders(next)
    broadcastSave(ORDERS_KEY, next)
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  const value = useMemo(() => ({
    products,
    addProduct,
    updateProduct,
    updateProductStock,
    deleteProduct,
    items,
    addItem,
    setQuantity,
    removeItem,
    clearCart,
    itemCount,
    subtotal,
    deskOrder,
    submitDeskOrder,
    updateDeskOrder,
    clearDeskOrder,
    addDeskItemsToCart,
    placedOrders,
    publishConfirmedOrder,
    updatePlacedOrder,
    orderDraft,
    setOrderDraft,
    cartRemovedToast,
    setCartRemovedToast
  }), [products, items, itemCount, subtotal, deskOrder, placedOrders, orderDraft, cartRemovedToast])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
