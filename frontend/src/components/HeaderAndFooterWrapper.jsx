'use client'

import React, { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from '../utils/router'
import { CreditCard, Menu, X } from 'lucide-react'
import { isAuthenticated, getUser, logout } from '../utils/auth'

export default function HeaderAndFooterWrapper({ children }) {
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    setLoggedIn(isAuthenticated())
    setUser(getUser())
  }, [])

  const handleLogout = () => {
    logout()
    setLoggedIn(false)
    setUser(null)
    window.location.href = '/'
  }

  return (
    <div className="app-container">
      {/* Portal Header */}
      <header className="header" style={{ padding: '0 2rem' }}>
        <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
          <CreditCard size={28} />
          <span>ArisX</span>
        </Link>
        
        <nav className="nav-tabs">
          <NavLink to="/" className="nav-link-tab" end>
            Pay Loan EMI
          </NavLink>
          <NavLink to={loggedIn ? "/settlement" : "/auth"} className="nav-link-tab">
            Loan Settlement {!loggedIn && '🔒'}
          </NavLink>
          <NavLink to={loggedIn ? "/autopay" : "/auth"} className="nav-link-tab">
            UPI AutoPay {!loggedIn && '🔒'}
          </NavLink>
        </nav>

        <div className="header-actions-desktop" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
              href="/auth" 
              className="btn btn-primary" 
              style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', cursor: 'pointer', borderRadius: '8px' }}
            >
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile Menu Toggle Button */}
        <button 
          className="menu-toggle-btn" 
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation menu"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      <div className={`mobile-menu-overlay ${menuOpen ? 'open' : ''}`}>
        <NavLink to="/" className="mobile-nav-link" onClick={() => setMenuOpen(false)} end>
          Pay Loan EMI
        </NavLink>
        <NavLink to={loggedIn ? "/settlement" : "/auth"} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
          Loan Settlement {!loggedIn && '🔒'}
        </NavLink>
        <NavLink to={loggedIn ? "/autopay" : "/auth"} className="mobile-nav-link" onClick={() => setMenuOpen(false)}>
          UPI AutoPay {!loggedIn && '🔒'}
        </NavLink>
        
        <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '1rem', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loggedIn ? (
            <>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', fontWeight: 600, paddingLeft: '1rem' }}>
                Hi, {user?.first_name || 'User'}
              </span>
              <button 
                onClick={() => {
                  setMenuOpen(false)
                  handleLogout()
                }} 
                className="btn btn-secondary" 
                style={{ width: '100%', padding: '0.8rem 1.8rem', fontSize: '1rem', borderRadius: '12px' }}
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link 
              href="/auth" 
              className="btn btn-primary" 
              onClick={() => setMenuOpen(false)}
              style={{ width: '100%', padding: '0.8rem 1.8rem', fontSize: '1rem', borderRadius: '12px' }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>

      {/* Portal Footer */}
      <footer className="footer">
        <p>© {new Date().getFullYear()} ArisX. Powered by Setu BBPS (v2) Integration Sandbox.</p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6 }}>
          Bharat Bill Payment System (BBPS) is a registered trademark of National Payments Corporation of India (NPCI).
        </p>
      </footer>
    </div>
  )
}
