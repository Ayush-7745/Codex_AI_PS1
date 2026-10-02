const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const products = [
  { id: 'atta', name: 'Aashirvaad Atta', category: 'Atta & Rice', price: 55, unit: 'kg', emoji: '🌾', color: 'sand', brand: 'Aashirvaad', stock: 18, keywords: ['atta', 'aata', 'flour', 'wheat', 'आटा', 'आटे', 'गेहूं'] },
  { id: 'sugar', name: 'Sugar', category: 'Atta & Rice', price: 48, unit: 'kg', emoji: '🧂', color: 'pink', stock: 3, keywords: ['cheeni', 'चीनी', 'शक्कर'] },
  { id: 'butter', name: 'Amul Butter', category: 'Dairy', price: 60, unit: 'pack', emoji: '🧈', color: 'yellow', brand: 'Amul', stock: 12, keywords: ['makhan', 'मक्खन', 'बटर'] },
  { id: 'sunflower', name: 'Fortune Sunflower Oil', category: 'Oil', price: 140, unit: 'litre', emoji: '🫙', color: 'orange', brand: 'Fortune', stock: 8, keywords: ['sunflower oil', 'fortune oil'] },
  { id: 'mustard', name: 'Fortune Mustard Oil', category: 'Oil', price: 155, unit: 'litre', emoji: '🫙', color: 'gold', brand: 'Fortune', stock: 6, keywords: ['mustard oil', 'sarson', 'sarson oil'] },
  { id: 'salt', name: 'Tata Salt', category: 'Oil', price: 25, unit: 'pack', emoji: '🧂', color: 'blue', brand: 'Tata', stock: 24, keywords: ['namak', 'नमक'] },
  { id: 'milk', name: 'Amul Taaza Milk', category: 'Dairy', price: 29, unit: 'pack', emoji: '🥛', color: 'blue', brand: 'Amul', stock: 2, keywords: ['doodh', 'दूध'] },
  { id: 'dal', name: 'Toor Dal', category: 'Atta & Rice', price: 120, unit: 'kg', emoji: '🫘', color: 'pink', stock: 9, keywords: ['pulses', 'arhar', 'daal', 'दाल'] },
  { id: 'rice', name: 'Rice', category: 'Atta & Rice', price: 65, unit: 'kg', emoji: '🍚', color: 'sand', stock: 15, keywords: ['चावल'] },
  { id: 'biscuits', name: 'Parle-G Biscuits', category: 'Snacks', price: 10, unit: 'pack', emoji: '🍪', color: 'gold', brand: 'Parle', stock: 20, keywords: ['biscuit', 'biskut'] },
  { id: 'tea', name: 'Tata Tea Gold', category: 'Beverages', price: 85, unit: 'pack', emoji: '🍵', color: 'sand', brand: 'Tata', stock: 7, keywords: ['chai', 'cai'] },
  { id: 'water', name: 'Packaged Water', category: 'Beverages', price: 20, unit: 'piece', emoji: '💧', color: 'blue', stock: 0, keywords: ['pani', 'bottle', 'water'] },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.json()
}

export function getLiveProducts() {
  try {
    const saved = localStorage.getItem('ai-order-products')
    return saved ? JSON.parse(saved) : products
  } catch {
    return products
  }
}

export async function getProducts() {
  try { return await request('/products') } catch { return getLiveProducts() }
}

function normalizeKeywords(product) {
  const kw = product.keywords
  if (Array.isArray(kw)) return kw.map(k => k.toLowerCase())
  if (typeof kw === 'string') return kw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
  return []
}

function findProductMatch(text, product) {
  const t = normalizeOrderText(text)
  const hindiAliases = { atta: ['आटा', 'आटे', 'गेहूं'], sugar: ['चीनी', 'शक्कर'], butter: ['मक्खन', 'बटर'], milk: ['दूध'], rice: ['चावल'], dal: ['दाल'], salt: ['नमक'] }[product.id] || []
  const nameMatch = t.includes(normalizeOrderText(product.name))
  const brandMatch = product.brand && t.includes(normalizeOrderText(product.brand))
  const kwMatch = [...normalizeKeywords(product), ...hindiAliases].some(k => t.includes(normalizeOrderText(k)))
  return nameMatch || brandMatch || kwMatch
}

function normalizeOrderText(value = '') {
  return value.toLowerCase().trim().replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)))
    .replace(/[^\p{L}\p{M}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ')
    .replace(/किलोग्राम|किलो|केजी|kilos?|kilograms?/g, 'kg').replace(/ग्राम/g, 'g')
    .replace(/लीटर|लिटर|liter/g, 'litre').replace(/पैकेट|पैक/g, 'pack')
    .replace(/आधा किलो/g, '0.5 kg').replace(/आधा|अधा/g, '0.5').replace(/डेढ़/g, '1.5').replace(/ढाई/g, '2.5')
    .replace(/एक/g, '1').replace(/दो/g, '2').replace(/तीन/g, '3').replace(/चार/g, '4').replace(/पाँच|पांच/g, '5')
}

export function mockParseOrder(input, catalogOverride) {
  const catalog = catalogOverride || getLiveProducts()
  const text = normalizeOrderText(input)
  const items = []
  const clarifications = []

  const quantityValue = (value) => ({ aadha: 0.5, adha: 0.5, half: 0.5, ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, four: 4, char: 4 }[value] ?? Number(value))
  const quantityMatch = (term) => {
    const product = catalog.find(p => p.id === term)
    const hindiAliases = { atta: ['आटा', 'आटे', 'गेहूं'], sugar: ['चीनी', 'शक्कर'], butter: ['मक्खन', 'बटर'], milk: ['दूध'], rice: ['चावल'], dal: ['दाल'], salt: ['नमक'] }[term] || []
    const aliases = [term, ...hindiAliases, ...(product ? [...normalizeKeywords(product), product.name, product.brand || ''] : [])]
    for (const alias of aliases.filter(Boolean)) {
      const escaped = normalizeOrderText(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const before = new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?)(?:\\s+(?:kg|g|litre|pack|l|ml|piece|bottle))?(?:\\s+[\\p{L}\\p{M}]+){0,2}\\s+${escaped}(?:$|\\s)`, 'u').exec(text)
      const after = new RegExp(`(?:^|\\s)${escaped}(?:\\s+[\\p{L}\\p{M}]+){0,2}\\s+(\\d+(?:\\.\\d+)?)(?:$|\\s)`, 'u').exec(text)
      const match = before || after
      if (match) return Number(match[1])
    }
    return null
  }

  const addOrClarify = (product, quantity) => {
    if (product.stock === 0) {
      clarifications.push({
        type: 'out_of_stock',
        productId: product.id,
        productName: product.name,
        message: `${product.name} is currently out of stock at Sharma General Store.`
      })
      return
    }
    if (quantity != null && Number.isFinite(quantity) && quantity > 0) {
      if (quantity > product.stock) {
        clarifications.push({
          type: 'stock_exceeded',
          productId: product.id,
          productName: product.name,
          availableStock: product.stock,
          unit: product.unit,
          message: `Only ${product.stock} ${product.unit} of ${product.name} is available in stock. Please choose a quantity up to ${product.stock} ${product.unit}.`
        })
      } else {
        items.push({ product, quantity })
      }
    } else {
      clarifications.push({
        type: 'quantity',
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        message: `How much ${product.name} would you like? Please tell us the quantity in ${product.unit}.`
      })
    }
  }

  // Check specific matched products in catalog
  const oilRequested = /(?:^|\s)(?:tel|oil|तेल)(?:$|\s)/u.test(text) && !text.includes('butter')
  const oilProducts = catalog.filter(p => p.name.toLowerCase().includes('oil') || normalizeKeywords(p).some(k => k.includes('oil')))

  // Map known terms
  catalog.forEach(product => {
    // If oil request is ambiguous, handle below
    if (oilRequested && oilProducts.some(op => op.id === product.id)) return
    if (findProductMatch(text, product)) {
      const qty = quantityMatch(product.id)
      addOrClarify(product, qty)
    }
  })

  // Ambiguous Oil check dynamically built from live catalog
  if (oilRequested) {
    const specifiedOil = oilProducts.find(p => findProductMatch(text, p))
    const oilQty = quantityMatch('तेल') || quantityMatch('tel') || quantityMatch('oil') || (specifiedOil ? quantityMatch(specifiedOil.id) : null)
    if (specifiedOil) {
      addOrClarify(specifiedOil, oilQty)
    } else if (oilProducts.length > 0) {
      clarifications.push({
        type: 'oil',
        message: '“Tel” could mean more than one oil in our store. Which one would you like?',
        options: oilProducts.map(p => p.id),
        quantity: oilQty
      })
    }
  }

  return { items, clarification: clarifications[0] || null, clarifications }
}

export async function parseOrder(input, catalogOverride) {
  const mockResult = mockParseOrder(input, catalogOverride)
  try {
    const apiResult = await request('/orders/parse', { method: 'POST', body: JSON.stringify({ text: input }) })
    if (mockResult.clarifications.length) return { ...apiResult, ...mockResult }
    return mockResult
  } catch { await wait(300); return mockResult }
}

export async function confirmOrder(items) {
  try { return await request('/orders/confirm', { method: 'POST', body: JSON.stringify({ items }) }) }
  catch {
    await wait(400)
    const nextId = Number(localStorage.getItem('ai-order-next-id') || 1024)
    localStorage.setItem('ai-order-next-id', String(nextId + 1))
    return { order_id: `ORD${nextId}`, total: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0) + 20, status: 'confirmed' }
  }
}

export async function getOrderDocument(orderId, type) {
  const route = type === 'bill' ? 'bill' : 'delivery-note'
  try { return await request(`/orders/${orderId}/${route}`) }
  catch { return { orderId, type, store: 'Sharma General Store' } }
}




