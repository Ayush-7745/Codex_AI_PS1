import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import Toast from '../../components/Toast.jsx'
import { useCart } from '../../context/CartContext.jsx'

const categoryOptions = ['Atta & Rice', 'Oil', 'Dairy', 'Snacks', 'Beverages']
const unitOptions = ['kg', 'litre', 'pack', 'piece']

export default function ProductForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { products, addProduct, updateProduct } = useCart()

  const isEdit = Boolean(id)
  const existingProduct = isEdit ? products.find(p => String(p.id) === String(id)) : null

  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('Atta & Rice')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('kg')
  const [stock, setStock] = useState('')
  const [keywords, setKeywords] = useState('')
  const [errors, setErrors] = useState({})
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (isEdit) {
      if (existingProduct) {
        setName(existingProduct.name || '')
        setBrand(existingProduct.brand || '')
        setCategory(existingProduct.category || 'Atta & Rice')
        setPrice(existingProduct.price != null ? String(existingProduct.price) : '')
        setUnit(existingProduct.unit || 'kg')
        setStock(existingProduct.stock != null ? String(existingProduct.stock) : '')
        const kw = existingProduct.keywords
        setKeywords(Array.isArray(kw) ? kw.join(', ') : (kw || ''))
      }
    }
  }, [id, existingProduct, isEdit])

  const validate = () => {
    const errs = {}
    if (!name.trim()) errs.name = 'Product name is required.'
    if (!price || isNaN(price) || Number(price) <= 0) errs.price = 'Price must be a positive number.'
    if (stock === '' || isNaN(stock) || Number(stock) < 0) errs.stock = 'Stock must be 0 or greater.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!validate()) return

    const productPayload = {
      name: name.trim(),
      brand: brand.trim(),
      category,
      price: Number(price),
      unit,
      stock: Number(stock),
      keywords: keywords.trim()
    }

    if (isEdit && existingProduct) {
      updateProduct(existingProduct.id, productPayload)
      setToast('Product updated successfully.')
    } else {
      addProduct(productPayload)
      setToast('Product added successfully.')
    }

    setTimeout(() => {
      navigate('/store/products')
    }, 600)
  }

  return <div className="app-shell">
    <Navbar/>
    <main className="page-width product-form-page">
      <div className="back-row">
        <Link to="/store/products">← &nbsp;Back to products catalog</Link>
      </div>

      <div className="page-title-row">
        <div>
          <span className="eyebrow">SHARMA GENERAL STORE</span>
          <h1>{isEdit ? 'Edit Product' : 'Add New Product'}<span className="title-dot">.</span></h1>
          <p>{isEdit ? 'Update product details, pricing, stock, and search keywords.' : 'Add a new product to your store inventory.'}</p>
        </div>
      </div>

      <form className="store-form-card" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <div className="form-field full-width">
            <label htmlFor="prod-name">Product Name *</label>
            <input
              id="prod-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Aashirvaad Atta"
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="prod-brand">Brand (Optional)</label>
            <input
              id="prod-brand"
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g., Aashirvaad"
            />
          </div>

          <div className="form-field">
            <label htmlFor="prod-category">Category *</label>
            <select
              id="prod-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="form-select"
            >
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="prod-price">Price (₹) *</label>
            <input
              id="prod-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g., 55"
            />
            {errors.price && <span className="form-error">{errors.price}</span>}
          </div>

          <div className="form-field">
            <label htmlFor="prod-unit">Unit *</label>
            <select
              id="prod-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="form-select"
            >
              {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="prod-stock">Current Stock *</label>
            <input
              id="prod-stock"
              type="number"
              min="0"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="e.g., 18"
            />
            {errors.stock && <span className="form-error">{errors.stock}</span>}
          </div>

          <div className="form-field full-width">
            <label htmlFor="prod-keywords">AI Search Keywords (Optional, comma-separated)</label>
            <input
              id="prod-keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="e.g., aata, flour, wheat"
            />
            <small className="form-hint">Used by the AI Order Desk to match customer voice/text phrases to this product.</small>
          </div>
        </div>

        <div className="form-actions-row">
          <Link className="secondary-button" to="/store/products">Cancel</Link>
          <button className="primary-button" type="submit">{isEdit ? 'Save Changes' : 'Create Product'} <span>→</span></button>
        </div>
      </form>

      <Toast message={toast} onClose={() => setToast('')}/>
    </main>
  </div>
}
