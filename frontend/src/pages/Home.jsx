import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldCheck, CreditCard, Clock } from 'lucide-react'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="hero-section">
      <div className="hero-content animate-fade-in">
        <h1>
          Simplify Your <br />
          <span className="gradient-text">Loan Repayments</span>
        </h1>
        <p className="hero-subtitle">
          Securely fetch, view, and pay your active Loan EMIs instantly through the official Bharat Bill Payment System (BBPS) gateway.
        </p>
        
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => navigate('/billers')}>
            Pay Loan EMI <ArrowRight size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '2rem', marginTop: '3.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', padding: '0.6rem', borderRadius: '10px' }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>NPCI Verified</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>BBPS Compliant</p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '0.6rem', borderRadius: '10px' }}>
              <CreditCard size={20} />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Instant Settlement</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Direct loan updates</p>
            </div>
          </div>
        </div>
      </div>

      <div className="hero-visual">
        <div className="hero-glow-card">
          <div className="hero-card-header">
            <div className="hero-card-chip"></div>
            <span className="hero-card-brand">ArisX</span>
          </div>
          
          <div className="hero-card-number">•••• •••• •••• 2026</div>
          
          <div className="hero-card-info">
            <div>
              <p>CARDHOLDER</p>
              <p style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.2rem' }}>BBPS SANDBOX</p>
            </div>
            <div>
              <p>EXPIRES</p>
              <p style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginTop: '0.2rem' }}>12/30</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
