import { Link } from 'react-router-dom'
import '@/styles/layout.css'

export function ForbiddenPage() {
  return (
    <div className="error-page">
      <h1>403</h1>
      <p>You do not have permission to view this page.</p>
      <Link to="/">Go home</Link>
    </div>
  )
}
