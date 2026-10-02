import { useCart } from '../context/CartContext.jsx'

export default function ProductCard({ product, onAdded }) {
  const { items, addItem, setQuantity } = useCart()
  const cartItem = items.find((item) => item.product.id === product.id)
  const stockLevel = product.stock === 0 ? 'out' : product.stock <= 5 ? 'low' : 'in'
  const label = stockLevel === 'out' ? 'Out of stock' : stockLevel === 'low' ? 'Low stock' : 'In stock'
  
  const add = () => {
    const res = addItem(product)
    if (res.error) onAdded?.(res.error)
    else if (res.warning) onAdded?.(res.warning)
    else onAdded?.(`${product.name} added to your cart.`)
  }

  return <article className="product-card">
    <div className={`product-art ${product.color || 'sand'}`}>
      <span>{product.emoji || '🛒'}</span>
      <span className={`stock-badge stock-${stockLevel}`}>{label}</span>
    </div>
    <div className="product-copy">
      <span className="product-category">{product.brand || product.category}</span>
      <h3>{product.name}</h3>
      <div className="product-bottom">
        <p className="product-price">₹{product.price}<span> / {product.unit}</span></p>
        {cartItem ? (
          <div className="product-stepper">
            <button onClick={() => setQuantity(product.id, cartItem.quantity - 1)} aria-label={`Decrease ${product.name}`}>−</button>
            <span>{cartItem.quantity}</span>
            <button disabled={cartItem.quantity >= product.stock} onClick={() => setQuantity(product.id, cartItem.quantity + 1)} aria-label={`Increase ${product.name}`}>+</button>
          </div>
        ) : (
          <button className="add-button" disabled={stockLevel === 'out'} onClick={add} aria-label={`Add ${product.name} to cart`}>+</button>
        )}
      </div>
    </div>
  </article>
}
