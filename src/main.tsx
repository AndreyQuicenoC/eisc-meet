import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes/router.tsx'
import useAuthStore from './stores/useAuthStore'
import './index.css'

function App() {
  const initAuthObserver = useAuthStore((state) => state.initAuthObserver);

  useEffect(() => {
    const unsubscribe = initAuthObserver();
    return () => unsubscribe();
  }, [initAuthObserver]);

  return <RouterProvider router={router} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
