import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Calendar, FileText, RefreshCw, User, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react'
import { authFetch } from '../utils/auth'

export default function LoanList() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const { fetchSessionId, biller } = location.state || {}
  
  const [status, setStatus] = useState('PENDING')
  const [bills, setBills] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState('')
  const [selectedBill, setSelectedBill] = useState(null)

  // UPI Mandate States
  const [loanId, setLoanId] = useState(null)
  const [mandate, setMandate] = useState(null)
  const [isSettingUpAutoPay, setIsSettingUpAutoPay] = useState(false)
  const [maxAmountInput, setMaxAmountInput] = useState('15000') // default 15,000 INR
  const [mandateLoading, setMandateLoading] = useState(false)
  const [mandateError, setMandateError] = useState('')

  // Redirect if no session details
  useEffect(() => {
    if (!fetchSessionId) {
      navigate('/billers')
    }
  }, [fetchSessionId, navigate])

  // Polling logic
  useEffect(() => {
    if (!fetchSessionId) return

    let intervalId
    const checkStatus = () => {
      authFetch(`/api/fetch/poll/${fetchSessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'SUCCESS') {
            setStatus('SUCCESS')
            setBills(data.bills)
            setCustomerName(data.customerName)
            setLoanId(data.loan_id)
            setMandate(data.mandate)
            if (data.bills && data.bills.length > 0) {
              setSelectedBill(data.bills[0]) // Select first bill by default
            }
            // Do not clear the interval! That way if mandate status changes (e.g. revoked), the page reacts immediately.
            // Wait, actually, if it's already success, we can keep polling or clear it. If we don't clear it, it will keep polling every 2s, which keeps mandate state real-time!
            // That is incredibly smart for a dashboard. Let's keep polling by NOT calling clearInterval if status is SUCCESS.
            // Oh wait, if the original code did clearInterval(intervalId), we can just remove clearInterval(intervalId) so it continues to poll and keep the dashboard updated!
            // Wait, let's see. If the original code cleared interval on success, let's not clear it so we poll continuously to reflect payments and mandate changes.
            // Let's keep checkStatus polling if status is SUCCESS.
            // Actually, we can remove clearInterval(intervalId) from the success branch. Yes! That keeps the dashboard refreshed in real-time.
          } else if (data.status === 'FAILURE') {
            setStatus('FAILURE')
            setError(data.error || 'Failed to retrieve active bills')
            clearInterval(intervalId)
          } else {
            // PENDING state, continue polling
            setStatus('PENDING')
          }
        })
        .catch(err => {
          setStatus('FAILURE')
          setError('Network issue polling bill details')
          clearInterval(intervalId)
        })
    }

    // Run first check immediately
    checkStatus()

    // Poll every 2 seconds
    intervalId = setInterval(checkStatus, 2000)

    return () => clearInterval(intervalId)
  }, [fetchSessionId])

  // Convert paise to rupees formatted
  const formatRupees = (paise) => {
    if (paise === undefined || paise === null) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  const handleSetupMandate = () => {
    if (!loanId) return
    setMandateLoading(true)
    setMandateError('')
    
    const amount_paise = parseInt(maxAmountInput) * 100
    if (isNaN(amount_paise) || amount_paise <= 0) {
      setMandateError('Please enter a valid maximum cap amount.')
      setMandateLoading(false)
      return
    }

    authFetch('/api/mandates/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        loan_id: loanId,
        max_amount_paise: amount_paise
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Mandate creation failed')
        return res.json()
      })
      .then(data => {
        setMandateLoading(false)
        setIsSettingUpAutoPay(false)
        navigate('/mandate/checkout', {
          state: {
            setuMandateId: data.setu_mandate_id,
            intentUrl: data.intent_url,
            loanId: loanId,
            maxAmountPaise: amount_paise,
            biller: biller,
            fetchSessionId: fetchSessionId
          }
        })
      })
      .catch(err => {
        setMandateLoading(false)
        setMandateError(err.message || 'Error initiating mandate setup.')
      })
  }

  const handleRevokeMandate = () => {
    if (!mandate || !mandate.setu_mandate_id) return
    if (!window.confirm("Are you sure you want to disable and revoke AutoPay? Future EMIs will not be recovered automatically.")) return
    
    setMandateLoading(true)
    setMandateError('')
    
    authFetch(`/api/mandates/simulate-revocation/${mandate.setu_mandate_id}`, {
      method: 'POST'
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to revoke mandate')
        return res.json()
      })
      .then(data => {
        setMandateLoading(false)
        alert('AutoPay revocation simulated successfully! Your mandate status will update shortly.')
      })
      .catch(err => {
        setMandateLoading(false)
        setMandateError(err.message || 'Error revoking mandate.')
      })
  }

  const handleProceedToPayment = () => {
    if (!selectedBill) return
    navigate('/checkout/simulate', {
      state: {
        fetchSessionId,
        biller,
        customerName,
        bill: selectedBill
      }
    })
  }

  if (status === 'PENDING') {
    return (
      <div className="loading-wrapper" style={{ padding: '6rem 2rem' }}>
        <div className="spinner"></div>
        <h2>Querying Central Bill Registry</h2>
        <p>Securing BBPS link and retrieving outstanding EMI details...</p>
        <div className="progress-bar-container">
          <div className="progress-bar"></div>
        </div>
      </div>
    )
  }

  if (status === 'FAILURE' || error) {
    return (
      <div className="glass-panel text-center" style={{ maxWidth: '600px', margin: '20px auto', padding: '3rem 2rem' }}>
        <AlertCircle size={48} color="#ef4444" style={{ marginBottom: '1.5rem' }} />
        <h2>Bill Retrieval Failed</h2>
        <p style={{ margin: '1rem 0', color: 'var(--text-secondary)' }}>{error}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/biller/${biller?.id}/identify`, { state: { biller } })}>
            <ArrowLeft size={16} /> Edit Details
          </button>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Retry Check
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', marginBottom: '2rem' }} onClick={() => navigate(`/biller/${biller?.id}/identify`, { state: { biller } })}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="loans-header">
        <div>
          <h2>Outstanding <span className="gradient-text">Loan Accounts</span></h2>
          <p>Active outstanding loans retrieved for customer: <strong>{customerName || 'N/A'}</strong></p>
        </div>
      </div>

      <div className="checkout-container">
        {/* Loan Cards List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {bills.map((bill, index) => {
            const isSelected = selectedBill?.billNumber === bill.billNumber
            return (
              <div 
                key={bill.billNumber || index}
                className={`glass-panel glass-panel-hoverable loan-card ${isSelected ? 'border-primary' : ''}`}
                style={{
                  borderLeft: isSelected ? '4px solid #6366f1' : '4px solid rgba(255, 255, 255, 0.1)',
                  background: isSelected ? 'rgba(99, 102, 241, 0.05)' : 'var(--glass-bg)'
                }}
                onClick={() => setSelectedBill(bill)}
              >
                <div className="loan-card-top">
                  <div>
                    <h3>{biller?.name}</h3>
                    <div className="loan-bill-no">Bill Number: {bill.billNumber}</div>
                  </div>
                  <div className="loan-amount-section">
                    <div className="loan-amount">{formatRupees(bill.amount)}</div>
                    <div className="loan-amount-label">Outstanding EMI</div>
                  </div>
                </div>

                <div className="loan-details-grid">
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">Due Date</div>
                    <div className="loan-detail-val" style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Calendar size={14} /> {bill.dueDate}
                    </div>
                  </div>
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">Period</div>
                    <div className="loan-detail-val">{bill.billPeriod}</div>
                  </div>
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">Bill Date</div>
                    <div className="loan-detail-val">{bill.billDate}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Selected Loan Detail Summary Sidebar */}
        <div className="summary-sidebar">
          {selectedBill ? (
            <div className="glass-panel" style={{ border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Payment Options</span>
                {mandate && mandate.status === 'ACTIVE' && (
                  <span className="badge badge-success" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '20px' }}>
                    AutoPay Active
                  </span>
                )}
              </h3>

              {/* Mode Selector Tabs (only shown if mandate is not already active) */}
              {(!mandate || mandate.status !== 'ACTIVE') && (
                <div className="tab-menu" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '0.3rem', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', border: 'none', background: !isSettingUpAutoPay ? 'var(--btn-primary-bg)' : 'transparent', color: !isSettingUpAutoPay ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                    onClick={() => setIsSettingUpAutoPay(false)}
                  >
                    One-Time Pay
                  </button>
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem', border: 'none', background: isSettingUpAutoPay ? 'var(--btn-primary-bg)' : 'transparent', color: isSettingUpAutoPay ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
                    onClick={() => setIsSettingUpAutoPay(true)}
                  >
                    AutoPay Setup
                  </button>
                </div>
              )}

              {/* Error messages if any */}
              {mandateError && (
                <div style={{ padding: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {mandateError}
                </div>
              )}

              {/* Scenario 1: Mandate is Active */}
              {mandate && mandate.status === 'ACTIVE' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="summary-row">
                    <span className="invoice-lbl">UMN (Mandate No)</span>
                    <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{mandate.umn}</span>
                  </div>
                  <div className="summary-row">
                    <span className="invoice-lbl">Maximum Limit</span>
                    <span className="invoice-val">{formatRupees(mandate.max_amount_paise)}</span>
                  </div>
                  <div className="summary-row">
                    <span className="invoice-lbl">Setu Mandate ID</span>
                    <span className="invoice-val" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{mandate.setu_mandate_id}</span>
                  </div>
                  <div className="summary-row">
                    <span className="invoice-lbl">Billing Cycle</span>
                    <span className="invoice-val">As Presented</span>
                  </div>

                  <div style={{ padding: '0.8rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.1)', borderRadius: '8px', fontSize: '0.75rem', color: '#fbbf24', marginTop: '0.5rem', lineHeight: '1.3' }}>
                    <strong>NPCI Autopay Notification:</strong> Recurring payments of up to {formatRupees(mandate.max_amount_paise)} are set up on this loan account. You will receive an SMS reminder 24 hours prior to any debit execution.
                  </div>

                  <button 
                    className="btn btn-secondary" 
                    style={{ width: '100%', marginTop: '1rem', border: '1px solid #ef4444', color: '#ef4444', cursor: 'pointer' }} 
                    onClick={handleRevokeMandate}
                    disabled={mandateLoading}
                  >
                    {mandateLoading ? 'Revoking...' : 'Disable AutoPay (Revoke)'}
                  </button>
                </div>
              ) : (
                /* Scenario 2: Mandate is not Active */
                <div>
                  {!isSettingUpAutoPay ? (
                    /* One-Time Payment Tab */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="summary-row">
                        <span className="invoice-lbl">Biller</span>
                        <span className="invoice-val">{biller?.name}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Customer Name</span>
                        <span className="invoice-val">{customerName}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Bill Number</span>
                        <span className="invoice-val">{selectedBill.billNumber}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Due Date</span>
                        <span className="invoice-val" style={{ color: '#f87171' }}>{selectedBill.dueDate}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Period</span>
                        <span className="invoice-val">{selectedBill.billPeriod}</span>
                      </div>
                      
                      <div className="summary-row summary-total" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                        <span>Payable Amount</span>
                        <span className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                          {formatRupees(selectedBill.amount)}
                        </span>
                      </div>

                      <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', cursor: 'pointer' }} onClick={handleProceedToPayment}>
                        Proceed to Payment <ArrowRight size={18} />
                      </button>
                    </div>
                  ) : (
                    /* AutoPay Setup Tab */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label className="invoice-lbl" htmlFor="max-cap-limit">Maximum Debit Cap (INR)</label>
                        <input 
                          id="max-cap-limit"
                          type="number" 
                          className="form-input" 
                          value={maxAmountInput}
                          onChange={(e) => setMaxAmountInput(e.target.value)}
                          placeholder="e.g. 15000"
                        />
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sets the maximum amount Setu is authorized to auto-debit per billing cycle.</span>
                      </div>

                      <div className="summary-row">
                        <span className="invoice-lbl">Frequency</span>
                        <span className="invoice-val">As Presented</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Expected EMI</span>
                        <span className="invoice-val">{formatRupees(selectedBill.amount)}</span>
                      </div>

                      <div style={{ padding: '0.8rem', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.1)', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                        <strong>UPI AutoPay:</strong> Automatically deducts recurring EMI payments directly from your bank account. No manual clicks required. Safe and NPCI compliant.
                      </div>

                      <button 
                        className="btn btn-primary" 
                        style={{ width: '100%', marginTop: '1rem', cursor: 'pointer' }} 
                        onClick={handleSetupMandate}
                        disabled={mandateLoading}
                      >
                        {mandateLoading ? 'Initiating Setup...' : 'Setup AutoPay'} <ArrowRight size={18} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel text-center" style={{ padding: '2rem' }}>
              <p>Select a loan card to view details and proceed to checkout.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
