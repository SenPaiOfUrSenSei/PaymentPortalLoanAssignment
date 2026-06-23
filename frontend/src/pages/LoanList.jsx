import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, Calendar, FileText, RefreshCw, User, ArrowLeft, ArrowRight, CheckCircle } from 'lucide-react'

export default function LoanList() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const { fetchSessionId, biller } = location.state || {}
  
  const [status, setStatus] = useState('PENDING')
  const [bills, setBills] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [error, setError] = useState('')
  const [selectedBill, setSelectedBill] = useState(null)

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
      fetch(`/api/fetch/poll/${fetchSessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'SUCCESS') {
            setStatus('SUCCESS')
            setBills(data.bills)
            setCustomerName(data.customerName)
            if (data.bills && data.bills.length > 0) {
              setSelectedBill(data.bills[0]) // Select first bill by default
            }
            clearInterval(intervalId)
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
              <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
                Payment Summary
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
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
                
                <div className="summary-row summary-total">
                  <span>Payable Amount</span>
                  <span className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    {formatRupees(selectedBill.amount)}
                  </span>
                </div>
              </div>

              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleProceedToPayment}>
                Proceed to Payment <ArrowRight size={18} />
              </button>
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
