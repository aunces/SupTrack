import { useRoutes } from 'react-router-dom'
import routes from '@/routes'
import ErrorBoundary from '@/components/ErrorBoundary'

function App() {
  const element = useRoutes(routes)

  return <ErrorBoundary>{element}</ErrorBoundary>
}

export default App
