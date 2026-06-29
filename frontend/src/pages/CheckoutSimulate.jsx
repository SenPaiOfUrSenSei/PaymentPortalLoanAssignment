import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Wallet, Shield, AlertCircle, RefreshCw } from 'lucide-react'
import { authFetch } from '../utils/auth'

export default function CheckoutSimulate() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const { fetchSessionId, biller, customerName, bill } = location.state || {}
  
  const [gateway, setGateway] = useState('')
  const [isSimulating, setIsSimulating] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!bill) {
    return (
      <div className="glass-panel text-center">
        <h2>Invalid Checkout State</h2>
        <button className="btn btn-primary" onClick={() => navigate('/billers')}>Return to Billers</button>
      </div>
    )
  }

  const formatRupees = (paise) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  const selectGateway = (gatewayName) => {
    setGateway(gatewayName)
    setIsSimulating(true)
  }

  const handleSimulateAction = (confirmPayment) => {
    setLoading(true)
    setError('')

    const initiatePayload = {
      fetchSessionId: fetchSessionId,
      amount: bill.amount,
      paymentGateway: gateway,
      customerName: customerName,
      billNumber: bill.billNumber
    }

    // 1. Create PENDING transaction
    authFetch('/api/payment/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initiatePayload)
    })
      .then(res => {
        if (!res.ok) throw new Error('Payment initialization failed')
        return res.json()
      })
      .then(initData => {
        const txnId = initData.transactionId
        
        // 2. Trigger simulation endpoint on backend
        return authFetch(`/api/payment/simulate/${txnId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ confirm: confirmPayment })
        })
      })
      .then(res => res.json())
      .then(simData => {
        setLoading(false)
        navigate('/payment/status', {
          state: {
            transactionId: simData.transactionId,
            status: simData.status,
            paymentRefId: simData.paymentRefId,
            errorMessage: simData.errorMessage,
            amount: bill.amount,
            gateway: gateway
          }
        })
      })
      .catch(err => {
        setLoading(false)
        setError(err.message || 'Simulation gateway error occurred')
      })
  }

  if (loading) {
    return (
      <div className="loading-wrapper" style={{ padding: '6rem 2rem' }}>
        <div className="spinner"></div>
        <h2>Processing Transaction...</h2>
        <p>Connecting with payment gateway and settling funds asynchronously with BBPS...</p>
        <div className="progress-bar-container">
          <div className="progress-bar"></div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {!isSimulating ? (
        <>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.5rem 1rem', marginBottom: '2rem' }} 
            onClick={() => navigate('/loans', { state: { fetchSessionId, biller } })}
          >
            <ArrowLeft size={16} /> Back to Loans
          </button>

          <h2>Checkout & <span className="gradient-text">Payment Gateway</span></h2>
          <p style={{ marginBottom: '2.5rem' }}>Select your preferred simulated payment method to continue</p>

          <div className="checkout-container">
            {/* Left pane: Gateway Buttons */}
            <div>
              <h3>Simulated Payment Gateways</h3>
              <div className="gateway-options">
                <button className="gateway-btn" onClick={() => selectGateway('GPay')}>
                  <div className="gateway-btn-left">
                    <div className="gateway-logo-placeholder gpay-logo">G</div>
                    <span>Google Pay (Simulated UPI)</span>
                  </div>
                  <Wallet size={18} color="var(--text-muted)" />
                </button>

                <button className="gateway-btn" onClick={() => selectGateway('PhonePe')}>
                  <div className="gateway-btn-left">
                    <div className="gateway-logo-placeholder phonepe-logo">P</div>
                    <span>PhonePe (Simulated UPI)</span>
                  </div>
                  <Wallet size={18} color="var(--text-muted)" />
                </button>

                <button className="gateway-btn" onClick={() => selectGateway('Razorpay')}>
                  <div className="gateway-btn-left">
                    <div className="gateway-logo-placeholder razorpay-logo">R</div>
                    <span>Razorpay Checkout (Simulated NetBanking)</span>
                  </div>
                  <Wallet size={18} color="var(--text-muted)" />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '2rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px' }}>
                <Shield size={24} color="#10b981" />
                <p style={{ fontSize: '0.85rem' }}>Your session is encrypted. Payment status will be confirmed within seconds.</p>
              </div>
            </div>

            {/* Right pane: Summary Sidebar */}
            <div className="summary-sidebar">
              <div className="glass-panel">
                <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
                  Payment Details
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="summary-row">
                    <span className="invoice-lbl">Customer</span>
                    <span className="invoice-val">{customerName}</span>
                  </div>
                  <div className="summary-row">
                    <span className="invoice-lbl">Loan Provider</span>
                    <span className="invoice-val">{biller?.name}</span>
                  </div>
                  <div className="summary-row">
                    <span className="invoice-lbl">Bill Number</span>
                    <span className="invoice-val">{bill.billNumber}</span>
                  </div>
                  
                  <div className="summary-row summary-total">
                    <span>Amount Due</span>
                    <span className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                      {formatRupees(bill.amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="simulate-wrapper">
          <div className="glass-panel">
            <div className="simulate-gateway-title">
              Simulated {gateway} Checkout
            </div>
            
            {error && (
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', marginBottom: '1.5rem' }}>
                <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
                {error}
              </div>
            )}

            <div style={{ padding: '2rem 1rem', background: 'rgba(255, 255, 255, 0.01)', border: '1px dashed var(--glass-border)', borderRadius: '12px', marginBottom: '2rem' }}>
              <p style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 600 }}>Amount: {formatRupees(bill.amount)}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Recipient: {biller?.name}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Customer: {customerName}</p>
            </div>

            <p style={{ fontSize: '0.9rem', marginBottom: '2rem' }}>
              Choose a simulation trigger action below to test the transaction result.
            </p>

            <div className="simulate-actions">
              <button className="btn btn-success" onClick={() => handleSimulateAction(true)}>
                Confirm Payment (Simulate Success)
              </button>
              
              <button className="btn btn-danger" onClick={() => handleSimulateAction(false)}>
                Cancel Payment (Simulate Failure)
              </button>

              <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setIsSimulating(false)}>
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
