import React from 'react'
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom'
import { CreditCard } from 'lucide-react'
import { isAuthenticated, getUser, logout } from './utils/auth'

// Import Pages
import Home from './pages/Home.jsx'
import Billers from './pages/Billers.jsx'
import Identify from './pages/Identify.jsx'
import LoanList from './pages/LoanList.jsx'
import CheckoutSimulate from './pages/CheckoutSimulate.jsx'
import PaymentStatus from './pages/PaymentStatus.jsx'
import Invoice from './pages/Invoice.jsx'
import Settlement from './pages/Settlement.jsx'
import MandateCheckout from './pages/MandateCheckout.jsx'
import AutopayDashboard from './pages/AutopayDashboard.jsx'
import Auth from './pages/Auth.jsx'
import Statement from './pages/Statement.jsx'

export default function App() {
  const loggedIn = isAuthenticated()
  const user = getUser()

  const handleLogout = () => {
    logout()
    window.location.href = '/'
  }

  return (
    <Router>
      <div className="app-container">
        
        {/* Portal Header */}
        <header className="header" style={{ padding: '0 2rem' }}>
          <Link to="/" className="logo">
            <CreditCard size={28} />
            <span>ArisX</span>
          </Link>
          
          <nav className="nav-tabs">
            <NavLink to="/" className={({ isActive }) => `nav-link-tab ${isActive ? 'active' : ''}`} end>
              Pay Loan EMI
            </NavLink>
            <NavLink to={loggedIn ? "/settlement" : "/auth"} className={({ isActive }) => `nav-link-tab ${isActive ? 'active' : ''}`}>
              Loan Settlement {!loggedIn && '🔒'}
            </NavLink>
            <NavLink to={loggedIn ? "/autopay" : "/auth"} className={({ isActive }) => `nav-link-tab ${isActive ? 'active' : ''}`}>
              UPI AutoPay {!loggedIn && '🔒'}
            </NavLink>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {loggedIn ? (
              <>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Hi, {user?.first_name || 'User'}
                </span>
                <button 
                  onClick={handleLogout} 
                  className="btn btn-secondary" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '8px' }}
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link 
                to="/auth" 
                className="btn btn-primary" 
                style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '8px' }}
              >
                Sign In
              </Link>
            )}
          </div>
        </header>

        {/* Main Content Area */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/billers" element={<Billers />} />
            <Route path="/biller/:billerId/identify" element={<Identify />} />
            <Route path="/loans" element={<LoanList />} />
            <Route path="/checkout/simulate" element={<CheckoutSimulate />} />
            <Route path="/payment/status" element={<PaymentStatus />} />
            <Route path="/invoice/:txnId" element={<Invoice />} />
            <Route path="/settlement" element={<Settlement />} />
            <Route path="/mandate/checkout" element={<MandateCheckout />} />
            <Route path="/autopay" element={<AutopayDashboard />} />
            <Route path="/statement" element={<Statement />} />
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
