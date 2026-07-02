import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Shield, ShieldCheck, XCircle } from 'lucide-react'
import { authFetch } from '../utils/auth'

export default function MandateCheckout() {
  const location = useLocation()
  const navigate = useNavigate()

  const { setuMandateId, intentUrl, loanId, maxAmountPaise, biller, fetchSessionId, isSettlement } = location.state || {}

  const [status, setStatus] = useState('INITIATED') // INITIATED, ACTIVE, FAILED
  const [umn, setUmn] = useState('')
  const [vpa, setVpa] = useState('')
  const [error, setError] = useState('')

  // Redirect back if accessed directly
  useEffect(() => {
    if (!setuMandateId) {
      navigate('/')
    }
  }, [setuMandateId, navigate])

  // Poll mandate status
  useEffect(() => {
    if (!setuMandateId) return

    let intervalId
    const checkStatus = () => {
      authFetch(`/api/mandates/${setuMandateId}/status`)
        .then(res => {
          if (!res.ok) throw new Error('Failed to retrieve mandate status')
          return res.json()
        })
        .then(data => {
          if (data.status === 'ACTIVE') {
            setStatus('ACTIVE')
            setUmn(data.umn)
            setVpa(data.customer_vpa)
            clearInterval(intervalId)
          } else if (data.status === 'REVOKED') {
            setStatus('FAILED')
            setError('Mandate was revoked or cancelled.')
            clearInterval(intervalId)
          }
        })
        .catch(err => {
          console.error(err)
        })
    }

    // Run first check immediately
    checkStatus()

    // Poll every 1.5 seconds
    intervalId = setInterval(checkStatus, 1500)

    return () => clearInterval(intervalId)
  }, [setuMandateId])

  const formatRupees = (paise) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  if (status === 'INITIATED') {
    return (
      <div style={{ maxWidth: '550px', margin: '0 auto', width: '100%' }}>
        <div className="glass-panel text-center" style={{ padding: '3rem 2rem' }}>
          <div className="spinner" style={{ margin: '0 auto 1.5rem auto' }}></div>
          <h2>{isSettlement ? 'Authorizing Settlement Mandate' : 'Authorizing AutoPay Mandate'}</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            {isSettlement
              ? `Awaiting UPI mandate approval. We have sent a notification to your UPI app. Please approve the recurring settlement EMI mandate of ${formatRupees(maxAmountPaise)}.`
              : `Awaiting UPI mandate approval. We have sent a notification to your UPI app. Please approve the recurring debit mandate of up to ${formatRupees(maxAmountPaise)}.`
            }
          </p>

          <div style={{ padding: '1.5rem', background: 'rgba(99, 102, 241, 0.05)', border: '1px dashed rgba(99, 102, 241, 0.3)', borderRadius: '12px', textAlign: 'left', marginBottom: '2.5rem' }}>
            <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={16} color="#6366f1" /> Mandate Details
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Merchant</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{biller?.name || 'Loan Provider'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{isSettlement ? 'EMI Amount' : 'Maximum Limit'}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{formatRupees(maxAmountPaise)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Frequency</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{isSettlement ? 'Monthly' : 'As Presented'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>UPI Intent Link</span>
              <span style={{ color: '#6366f1', fontFamily: 'monospace', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                {intentUrl}
              </span>
            </div>
          </div>

          <div className="progress-bar-container" style={{ marginBottom: '1.5rem' }}>
            <div className="progress-bar" style={{ animation: 'loading 4s infinite linear' }}></div>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
            <ShieldCheck size={14} color="#10b981" /> Secured via NPCI UPI AutoPay Network
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '550px', margin: '0 auto', width: '100%' }}>
      <div className="glass-panel text-center" style={{ padding: '3rem 2rem' }}>
        {status === 'ACTIVE' ? (
          <>
            {/* SVG Checkmark Animation */}
            <div className="checkmark-container" style={{ marginBottom: '1.5rem' }}>
              <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
                <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
              </svg>
            </div>
            <h2 className="gradient-text">{isSettlement ? 'Settlement Mandate Active!' : 'AutoPay Setup Active!'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              {isSettlement
                ? 'Your UPI recurring mandate is active. Your loan outstanding has been updated to the settled amount, and the first installment has been scheduled.'
                : 'Your UPI recurring mandate is active. Your future loan EMIs will be automatically paid.'
              }
            </p>

            <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px', textAlign: 'left', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>{isSettlement ? 'EMI Installment' : 'Max Limit Cap'}</span>
                <span className="invoice-val" style={{ color: '#10b981', fontWeight: 700 }}>{formatRupees(maxAmountPaise)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>UPI ID (VPA)</span>
                <span className="invoice-val">{vpa || 'customer@upi'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Unique Mandate Number (UMN)</span>
                <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>{umn}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="invoice-lbl" style={{ flex: 1 }}>Setu Mandate ID</span>
                <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{setuMandateId}</span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                if (isSettlement) {
                  navigate('/settlement')
                } else {
                  navigate('/loans', { state: { fetchSessionId, biller } })
                }
              }}
            >
              {isSettlement ? 'Return to Settlement Desk' : 'Back to Loan Account Details'}
            </button>
          </>
        ) : (
          <>
            <div style={{ margin: '0 auto 2rem auto', color: '#ef4444', display: 'flex', justifyContent: 'center' }}>
              <XCircle size={80} style={{ filter: 'drop-shadow(var(--glow-error))' }} />
            </div>

            <h2 style={{ color: '#ef4444' }}>{isSettlement ? 'Settlement Setup Failed' : 'AutoPay Setup Failed'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
              {isSettlement
                ? 'We could not register your recurring settlement mandate request.'
                : 'We could not register your recurring mandate request.'
              }
            </p>

            <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: '12px', textAlign: 'center', color: '#f87171', marginBottom: '2.5rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Reason for Failure:</p>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.9 }}>{error || 'Mandate authorization timed out or declined.'}</p>
            </div>

            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => {
                if (isSettlement) {
                  navigate('/settlement')
                } else {
                  navigate('/loans', { state: { fetchSessionId, biller } })
                }
              }}
            >
              {isSettlement ? 'Return to Settlement Desk' : 'Back to Loan Details'}
            </button>
          </>
        )
        }
      </div>
    </div>
  )
}
