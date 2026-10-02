import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar.jsx'
import Toast from '../../components/Toast.jsx'
import { useCart } from '../../context/CartContext.jsx'

const categories = ['All', 'Atta & Rice', 'Oil', 'Dairy', 'Snacks', 'Beverages']

export default function Products() {
  const { products, updateProductStock, deleteProduct } = useCart()
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [deleteModalProd, setDeleteModalProd] = useState(null)

  const visible = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category
      const q = search.toLowerCase()
      const matchesSearch = p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q)) || (p.keywords && p.keywords.some(k => k.toLowerCase().includes(q)))
      return matchesCategory && matchesSearch
    })
  }, [products, category, search])

  const handleDeleteConfirm = () => {
    if (!deleteModalProd) return
    deleteProduct(deleteModalProd.id)
    setToast(`Product "${deleteModalProd.name}" deleted successfully.`)
    setDeleteModalProd(null)
  }

  return <div className="app-shell">
    <Navbar/>
    <main className="page-width store-products-page">
      <div className="back-row">
        <Link to="/store/dashboard">← &nbsp;Back to dashboard</Link>
      </div>

      <div className="page-title-row">
        <div>
          <span className="eyebrow">SHARMA GENERAL STORE · INVENTORY</span>
          <h1>Product Catalog<span className="title-dot">.</span></h1>
          <p>Manage products, edit prices, and update stock in real-time.</p>
        </div>
        <Link className="primary-button" to="/store/products/add">+ Add Product</Link>
      </div>

      <section className="customer-products">
        <div className="section-heading">
          <label className="search-box">
            <span>⌕</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products or keywords" aria-label="Search products"/>
          </label>
        </div>

        <div className="category-row">
          {categories.map((cat) => (
            <button key={cat} className={`category-chip ${category === cat ? 'active' : ''}`} onClick={() => setCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="products-table-wrapper desktop-only">
          <table className="products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock (Inline Edit)</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => {
                const stockLevel = p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : 'in'
                const stockLabel = stockLevel === 'out' ? 'Out of stock' : stockLevel === 'low' ? 'Low stock' : 'In stock'
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="table-product-info">
                        <span className="table-product-emoji">{p.emoji || '📦'}</span>
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.brand || p.category}</small>
                        </div>
                      </div>
                    </td>
                    <td>{p.category}</td>
                    <td><strong>₹{p.price}</strong> / {p.unit}</td>
                    <td>
                      <div className="inline-stock-control">
                        <button onClick={() => updateProductStock(p.id, p.stock - 1)} disabled={p.stock <= 0} aria-label={`Decrease stock of ${p.name}`}>−</button>
                        <input
                          type="number"
                          min="0"
                          value={p.stock}
                          onChange={(e) => updateProductStock(p.id, e.target.value)}
                          aria-label={`Stock count for ${p.name}`}
                        />
                        <button onClick={() => updateProductStock(p.id, p.stock + 1)} aria-label={`Increase stock of ${p.name}`}>+</button>
                      </div>
                    </td>
                    <td>
                      <span className={`stock-badge stock-${stockLevel}`}>{stockLabel}</span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link className="secondary-button compact-btn" to={`/store/products/${p.id}/edit`}>Edit</Link>
                        <button className="ghost-button danger-text compact-btn" onClick={() => setDeleteModalProd(p)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="products-mobile-list mobile-only">
          {visible.map((p) => {
            const stockLevel = p.stock === 0 ? 'out' : p.stock <= 5 ? 'low' : 'in'
            const stockLabel = stockLevel === 'out' ? 'Out of stock' : stockLevel === 'low' ? 'Low stock' : 'In stock'
            return (
              <div key={p.id} className="product-mobile-card">
                <div className="mobile-card-header">
                  <div className="table-product-info">
                    <span className="table-product-emoji">{p.emoji || '📦'}</span>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{p.brand || p.category} · ₹{p.price} / {p.unit}</small>
                    </div>
                  </div>
                  <span className={`stock-badge stock-${stockLevel}`}>{stockLabel}</span>
                </div>

                <div className="mobile-card-stock">
                  <span>Stock:</span>
                  <div className="inline-stock-control">
                    <button onClick={() => updateProductStock(p.id, p.stock - 1)} disabled={p.stock <= 0}>−</button>
                    <input
                      type="number"
                      min="0"
                      value={p.stock}
                      onChange={(e) => updateProductStock(p.id, e.target.value)}
                    />
                    <button onClick={() => updateProductStock(p.id, p.stock + 1)}>+</button>
                  </div>
                </div>

                <div className="mobile-card-actions">
                  <Link className="secondary-button compact-btn" to={`/store/products/${p.id}/edit`}>Edit</Link>
                  <button className="ghost-button danger-text compact-btn" onClick={() => setDeleteModalProd(p)}>Delete</button>
                </div>
              </div>
            )
          })}
        </div>

        {!visible.length && <p className="empty-search">No products found matching your filter.</p>}
      </section>

      {/* Delete Confirmation Modal */}
      {deleteModalProd && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <h3>Delete Product</h3>
            <p>Are you sure you want to delete <strong>{deleteModalProd.name}</strong>? This action cannot be undone and will remove it from any active customer carts.</p>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setDeleteModalProd(null)}>Cancel</button>
              <button className="primary-button danger-btn" onClick={handleDeleteConfirm}>Yes, Delete Product</button>
            </div>
          </div>
        </div>
      )}

      <Toast message={toast} onClose={() => setToast('')}/>
    </main>
  </div>
}
