'use client'

import React from 'react'
import { useLocation, useNavigate } from '../../../utils/router'
import { CheckCircle2, XCircle, ArrowRight, RefreshCw, FileText } from 'lucide-react'

export default function PaymentStatus() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const { transactionId, status, paymentRefId, errorMessage, amount, gateway } = location.state || {}

  // Redirect to home if accessed directly without transaction state
  if (!transactionId) {
    return (
      <div className="glass-panel text-center">
        <h2>No Transaction Found</h2>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Home</button>
      </div>
    )
  }

  const formatRupees = (paise) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  const isSuccess = status === 'SUCCESSFUL'

  return (
    <div style={{ maxWidth: '550px', margin: '0 auto', width: '100%' }}>
      <div className="glass-panel text-center">
        
        {isSuccess ? (
          <>
            {/* SVG Checkmark Animation */}
            <div className="checkmark-container">
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            
            <h2 className="gradient-text">Payment Successful!</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              Your loan EMI payment has been processed and settled with the provider.
            </p>

            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px', textAlign: 'left', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Amount Paid</span>
                <span className="invoice-val" style={{ color: '#10b981', fontWeight: 700 }}>{formatRupees(amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Payment Method</span>
                <span className="invoice-val">{gateway}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Transaction Ref</span>
                <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{paymentRefId || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Portal Order ID</span>
                <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{transactionId}</span>
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(`/invoice/${transactionId}`)}>
              View Receipt & Download Invoice <FileText size={18} />
            </button>
          </>
        ) : (
          <>
            <div style={{ margin: '0 auto 2rem auto', color: '#ef4444', display: 'flex', justifyContent: 'center' }}>
              <XCircle size={80} style={{ filter: 'drop-shadow(var(--glow-error))' }} />
            </div>
            
            <h2 style={{ color: '#ef4444' }}>Transaction Failed</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              We could not complete your loan repayment transaction.
            </p>

            <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '12px', textAlign: 'center', color: '#f87171', marginBottom: '2.5rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Reason for Failure:</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.9 }}>{errorMessage || 'Payment aborted or timed out at checkout gateway.'}</p>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => navigate('/')}>
                Back to Home
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => navigate(-1)}>
                <RefreshCw size={16} /> Retry Payment
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
