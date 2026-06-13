import { Link } from 'react-router-dom'
import '@/styles/layout.css'

export function NotFoundPage() {
  return (
    <div className="error-page">
      <h1>404</h1>
      <p>Page not found.</p>
      <Link to="/">Go home</Link>
    </div>
  )
}
