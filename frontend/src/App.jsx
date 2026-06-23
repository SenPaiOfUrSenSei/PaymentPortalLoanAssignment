import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import { CreditCard } from 'lucide-react'

// Import Pages
import Home from './pages/Home.jsx'
import Billers from './pages/Billers.jsx'
import Identify from './pages/Identify.jsx'
import LoanList from './pages/LoanList.jsx'
import CheckoutSimulate from './pages/CheckoutSimulate.jsx'
import PaymentStatus from './pages/PaymentStatus.jsx'
import Invoice from './pages/Invoice.jsx'

export default function App() {
  return (
    <Router>
      <div className="app-container">
        
        {/* Portal Header */}
        <header className="header">
          <Link to="/" className="logo">
            <CreditCard size={28} />
            <span>ArisX</span>
          </Link>
          <nav>
            <Link to="/billers" className="nav-link">
              Search Providers
            </Link>
          </nav>
        </header>

        {/* Main Content Area */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/billers" element={<Billers />} />
            <Route path="/biller/:billerId/identify" element={<Identify />} />
            <Route path="/loans" element={<LoanList />} />
            <Route path="/checkout/simulate" element={<CheckoutSimulate />} />
            <Route path="/payment/status" element={<PaymentStatus />} />
            <Route path="/invoice/:txnId" element={<Invoice />} />
          </Routes>
        </main>

        {/* Portal Footer */}
        <footer className="footer">
          <p>© {new Date().getFullYear()} ArisX. Powered by Setu BBPS (v2) Integration Sandbox.</p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6 }}>
            Bharat Bill Payment System (BBPS) is a registered trademark of National Payments Corporation of India (NPCI).
          </p>
        </footer>

      </div>
    </Router>
  )
}
