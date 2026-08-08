import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import VaultPage from './pages/VaultPage'
import GeneratorPage from './pages/GeneratorPage'
import { VaultProvider } from '@/context/VaultContext'

function App() {
  return (
    <VaultProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/generator" element={<GeneratorPage />} />
        </Routes>
      </BrowserRouter>
    </VaultProvider>
  )
}

export default App
