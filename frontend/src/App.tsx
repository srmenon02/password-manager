import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import VaultPage from './pages/VaultPage'
import VaultSharingPage from './pages/VaultSharingPage'
import VaultActivityPage from './pages/VaultActivityPage'
import VaultBreachPage from './pages/VaultBreachPage'
import GeneratorPage from './pages/GeneratorPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsPage from './pages/TermsPage'
import NotFoundPage from './pages/NotFoundPage'
import { VaultProvider, useVault } from '@/context/VaultContext'
import AppHeader from '@/components/AppHeader'

// Holds the vault routes for the one tick it takes to rehydrate a reloaded session, so a
// refresh does not flash "Vault locked" on its way back to an unlocked vault.
function RestoringVaultSession() {
  const { isRestoring } = useVault()

  if (!isRestoring) {
    return <Outlet />
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <AppHeader />
      <div className="flex-grow flex items-center justify-center px-gutter py-16">
        <p role="status" className="font-body-md text-body-md text-on-surface-variant">
          Unlocking your vault…
        </p>
      </div>
    </div>
  )
}

function App() {
  return (
    <VaultProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RestoringVaultSession />}>
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/vault/sharing" element={<VaultSharingPage />} />
            <Route path="/vault/activity" element={<VaultActivityPage />} />
            <Route path="/vault/breach" element={<VaultBreachPage />} />
          </Route>
          <Route path="/generator" element={<GeneratorPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </VaultProvider>
  )
}

export default App
