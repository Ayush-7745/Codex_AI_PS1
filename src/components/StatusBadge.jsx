const labels = { received: 'New', new: 'New', preparing: 'Preparing', packed: 'Packed', out_for_delivery: 'Out for delivery', delivered: 'Delivered', waiting_customer: 'Needs your reply', waiting_store: 'Store reviewing', ready: 'Store reviewing', approved: 'Confirmed', in_cart: 'In cart' }
export default function StatusBadge({ status = 'received' }) {
  const normalized = status === 'received' ? 'new' : status
  return <span className={`status-badge badge-${normalized}`}>{labels[status] || status.replaceAll('_', ' ')}</span>
}
