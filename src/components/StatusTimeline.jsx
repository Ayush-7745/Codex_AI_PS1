const requestStages = [
  { key: 'sent', label: 'Sent to store' },
  { key: 'reviewing', label: 'Store reviewing' },
  { key: 'confirmed', label: 'Confirmed' },
]
const deliveryStages = [
  { key: 'placed', label: 'Order placed' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'on-way', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
]
function stageFor(status, variant) {
  if (variant === 'request') {
    if (['approved', 'in_cart'].includes(status)) return 2
    if (['processing', 'waiting_customer', 'waiting_store', 'ready'].includes(status)) return 1
    return 0
  }
  if (status === 'delivered') return 3
  if (status === 'out_for_delivery') return 2
  if (['preparing', 'packed'].includes(status)) return 1
  return 0
}
export default function StatusTimeline({ status = 'received', compact = false, variant = 'delivery' }) {
  const stages = variant === 'request' ? requestStages : deliveryStages
  const current = stageFor(status, variant)
  return <ol className={`status-timeline ${compact ? 'timeline-compact' : ''} ${variant === 'request' ? 'request-timeline' : 'delivery-timeline'}`}>{stages.map((stage, index) => <li key={stage.key} className={`${index < current ? 'complete' : ''} ${index === current ? 'current' : ''}`}><span className="timeline-dot">{index < current ? '✓' : index + 1}</span><span>{stage.label}</span></li>)}</ol>
}
