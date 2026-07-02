import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { 
  AlertCircle, Calendar, FileText, RefreshCw, User, ArrowLeft, ArrowRight, 
  CheckCircle, Lock, Shield, TrendingDown, Download, CreditCard, Printer, Info, HelpCircle
} from 'lucide-react'
import { isAuthenticated, getUser, authFetch } from '../utils/auth'

export default function Settlement() {
  const location = useLocation()
  const navigate = useNavigate()
  const { preSelectedLoanId, preSelectedLoan } = location.state || {}

  // Steps: LOGIN, CONSENT, DASHBOARD, CALCULATING, DETAILS, PAYMENT, SUCCESS
  const [step, setStep] = useState('LOGIN')
  const [mobile, setMobile] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpHint, setOtpHint] = useState('')
  const [consentId, setConsentId] = useState('')
  
  // Dashboard & Loans State
  const [loans, setLoans] = useState([])
  const [activeTab, setActiveTab] = useState('ACTIVE') // ACTIVE or SETTLED
  const [customerName, setCustomerName] = useState('')
  
  // Calculation / Settlement State
  const [selectedLoan, setSelectedLoan] = useState(null)
  const [quote, setQuote] = useState(null)
  const [paymentGateway, setPaymentGateway] = useState('GPay')
  const [settledResult, setSettledResult] = useState(null)
  const [paymentOption, setPaymentOption] = useState('FULL') // FULL or EMI
  const [tenureMonths, setTenureMonths] = useState(3) // 3, 6, 9, 12 months

  // Credit score simulation states
  const [simulationResult, setSimulationResult] = useState(null)
  const [simulationLoading, setSimulationLoading] = useState(false)

  // App States
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpError, setOtpError] = useState('')

  // Format currency
  const formatRupees = (paise) => {
    if (paise === undefined || paise === null) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  // Automatic JWT login & direct redirect flow on mount
  useEffect(() => {
    if (!isAuthenticated()) return

    const u = getUser()
    if (!u) return

    setMobile(u.mobile)
    setLoading(true)
    setError('')

    // Check if user has AA consent, or request one
    authFetch(`/api/settlement/loans?mobile=${u.mobile}`)
      .then(async (res) => {
        if (res.status === 403) {
          // No active AA consent. Trigger consent request automatically
          return authFetch('/api/settlement/consent/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mobile: u.mobile })
          })
            .then(res => res.json())
            .then(data => {
              setConsentId(data.consentId)
              setOtpSent(true)
              setOtpHint('482165') // Mock OTP hint
              setStep('CONSENT')
              setLoading(false)
            })
        }
        return res.json().then(data => {
          setLoans(data)
          if (data && data.length > 0) {
            setCustomerName(data[0].customerName)
          } else {
            setCustomerName('Valued Customer')
          }
          setLoading(false)

          // If a loan was pre-selected from the Home Screen, go straight to calculation
          const loanToSettle = preSelectedLoan || (preSelectedLoanId ? data.find(l => l.id === preSelectedLoanId) : null)
          if (loanToSettle && loanToSettle.status === 'ACTIVE') {
            handleSettleNow(loanToSettle)
          } else {
            setStep('DASHBOARD')
          }
        })
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  // Phase 1: Request Consent (Login)
  const handleInitiateConsent = (e) => {
    e.preventDefault()
    if (!mobile || mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    setError('')
    setLoading(true)
    
    authFetch('/api/settlement/consent/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile })
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to create consent request.')
        return res.json()
      })
      .then(data => {
        setConsentId(data.consentId)
        setOtpSent(true)
        setOtpHint('482165') // Mock OTP hint shown to user
        setStep('CONSENT')
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  // Phase 2: Approve Consent via mock AA
  const handleVerifyConsent = (e) => {
    e.preventDefault()
    if (!otp || otp.length !== 6) {
      setOtpError('Please enter a 6-digit OTP.')
      return
    }
    setOtpError('')
    setLoading(true)

    authFetch('/api/settlement/consent/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile, otp })
    })
      .then(res => {
        if (!res.ok) throw new Error('Invalid verification OTP code.')
        return res.json()
      })
      .then(data => {
        // Fetch User Loans
        fetchLoans()
      })
      .catch(err => {
        setOtpError(err.message)
        setLoading(false)
      })
  }

  const fetchLoans = () => {
    setLoading(true)
    authFetch(`/api/settlement/loans?mobile=${mobile}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to retrieve active credit files.')
        return res.json()
      })
      .then(data => {
        setLoans(data)
        if (data && data.length > 0) {
          setCustomerName(data[0].customerName)
        } else {
          setCustomerName('Valued Customer')
        }
        
        // Check for pre-selected loan redirect
        const loanToSettle = preSelectedLoanId ? data.find(l => l.id === preSelectedLoanId) : null
        if (loanToSettle && loanToSettle.status === 'ACTIVE') {
          handleSettleNow(loanToSettle)
        } else {
          setStep('DASHBOARD')
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  // Phase 3: Initiate Settlement calculation
  const handleSettleNow = (loan) => {
    setSelectedLoan(loan)
    setStep('CALCULATING')
    setError('')
    setSimulationLoading(true)
    setSimulationResult(null)

    const u = getUser()

    // Hit calculation API and simulator API concurrently
    Promise.all([
      authFetch('/api/settlement/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId: loan.id })
      }).then(res => {
        if (!res.ok) throw new Error('Failed to calculate settlement quotation.')
        return res.json()
      }),
      authFetch('/api/intelligence/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: u?.first_name || 'User',
          lastName: u?.last_name || '',
          mobileNumber: u?.mobile || '',
          pan: u?.pan || '',
          consentFlag: true,
          consentTimestamp: Math.floor(Date.now() / 1000),
          simulatedAction: {
            actionType: 'SETTLE_NOW',
            monetaryValue: 0,
            targetAccountType: loan.type || 'PERSONAL_LOAN'
          }
        })
      }).then(res => {
        if (!res.ok) throw new Error('Simulation failed')
        return res.json()
      })
    ])
      .then(([quoteData, simData]) => {
        setQuote(quoteData)
        setSimulationResult(simData)
        setSimulationLoading(false)
        // Hold on calculating screen for 2.2s for cool animation effect
        setTimeout(() => {
          setStep('DETAILS')
        }, 2200)
      })
      .catch(err => {
        setError(err.message)
        setSimulationLoading(false)
        setStep('DASHBOARD')
      })
  }
  // Phase 4: Submit Payment
  const handleProceedToPayment = () => {
    if (paymentOption === 'FULL') {
      setStep('PAYMENT')
    } else {
      setLoading(true)
      setError('')
      
      authFetch('/api/settlement/mandate/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: selectedLoan.id,
          settlementAmount: quote.settlementAmount,
          tenureMonths: tenureMonths
        })
      })
        .then(res => {
          if (!res.ok) throw new Error('Failed to initiate settlement mandate.')
          return res.json()
        })
        .then(data => {
          setLoading(false)
          navigate('/mandate/checkout', {
            state: {
              setuMandateId: data.setuMandateId,
              intentUrl: data.intentUrl,
              loanId: selectedLoan.id,
              maxAmountPaise: Math.floor(quote.settlementAmount / tenureMonths),
              biller: { id: selectedLoan.billerId, name: selectedLoan.billerName },
              fetchSessionId: null,
              isSettlement: true
            }
          })
        })
        .catch(err => {
          setError(err.message)
          setLoading(false)
        })
    }
  }

  const handleConfirmPayment = () => {
    setLoading(true)
    setError('')
    
    authFetch('/api/settlement/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        loanId: selectedLoan.id,
        amount: quote.settlementAmount,
        paymentGateway
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Settlement payment failed at gateway.')
        return res.json()
      })
      .then(data => {
        setSettledResult(data)
        setStep('SUCCESS')
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  // Back trigger to Dashboard
  const handleReset = () => {
    // Refresh loans list
    fetchLoans()
  }

  const handlePrint = () => {
    window.print()
  }

  // Filter loans based on activeTab
  const activeLoans = loans.filter(l => l.status === 'ACTIVE' && l.dpd >= 90)
  const settledLoans = loans.filter(l => l.status === 'SETTLED')

  // Render Screens
  return (
    <div className="settlement-container">
      {/* ERROR MESSAGE BAR */}
      {error && (
        <div className="glass-panel text-center animate-fade-in" style={{ border: '1px solid #f87171', padding: '1.5rem', marginBottom: '2rem' }}>
          <AlertCircle size={28} color="#ef4444" style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{error}</span>
        </div>
      )}

      {/* STEP 1: LOGIN */}
      {step === 'LOGIN' && (
        <div className="glass-panel identify-container animate-fade-in" style={{ padding: '3rem 2rem' }}>
          <div className="text-center" style={{ marginBottom: '2rem' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', padding: '1rem', borderRadius: '50%', display: 'inline-flex', marginBottom: '1.2rem' }}>
              <Shield size={36} />
            </div>
            <h2>ArisX Settlement Desk</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Verify your mobile number and link accounts via Setu's Account Aggregator to explore discounted prepayments and settlements.
            </p>
          </div>

          <form onSubmit={handleInitiateConsent}>
            <div className="form-group">
              <label className="form-label">Registered Mobile Number</label>
              <input 
                type="tel" 
                className="form-input" 
                placeholder="e.g. 9876543210" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value.replace(/\D/g,'').slice(0, 10))}
                maxLength={10}
                required 
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                💡 Seeded mobile numbers to test: <strong>9876543210</strong> (3 loans) or <strong>9999988888</strong> (2 loans).
              </span>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1.5rem' }} 
              disabled={loading}
            >
              {loading ? 'Initiating Linkage...' : 'Link Financial Accounts'} <ArrowRight size={18} />
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: CONSENT (SETU AA SIMULATION) */}
      {step === 'CONSENT' && (
        <div className="glass-panel identify-container animate-fade-in" style={{ padding: '2.5rem', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1.2rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#09090b', color: '#fff', padding: '0.5rem', borderRadius: '8px' }}>
              <Shield size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Setu Account Aggregator</h3>
              <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--text-muted)' }}>MOCK AA SANDBOX GATEWAY</p>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              <strong>ArisX Settlement Portal</strong> is requesting consent to fetch your loan and credit account information.
            </p>

            {/* Consent Card Info */}
            <div style={{ background: 'rgba(9, 9, 11, 0.02)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Data Requested</span>
                <span style={{ fontWeight: 600 }}>Loan Accounts (LOAN), Credit Cards (CREDIT_CARD)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Purpose</span>
                <span style={{ fontWeight: 600 }}>Loan Settlement and Prepayment Profile</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Consent Duration</span>
                <span style={{ fontWeight: 600, color: '#10b981' }}>Indefinite / Permanent</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Fetch Frequency</span>
                <span style={{ fontWeight: 600 }}>On-Demand / Continuous</span>
              </div>
            </div>
          </div>

          {/* OTP Approval Trigger */}
          <form onSubmit={handleVerifyConsent}>
            {!otpSent ? (
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ width: '100%' }}
                onClick={() => setOtpSent(true)}
              >
                Approve Consent Details
              </button>
            ) : (
              <div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px dashed #10b981', borderRadius: '10px', padding: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                  <Info size={18} />
                  <span>
                    Mock AA Verification Code sent to phone: <strong>{otpHint}</strong>
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Verification OTP</label>
                  <input 
                    type="password" 
                    className="form-input text-center" 
                    placeholder="Enter 6-digit code" 
                    value={otp} 
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g,'').slice(0, 6))}
                    maxLength={6}
                    style={{ letterSpacing: '0.2em', fontWeight: 'bold', fontSize: '1.2rem' }}
                    required 
                  />
                  {otpError && <p className="error-text">{otpError}</p>}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep('LOGIN')}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                    {loading ? 'Linking...' : 'Grant Access'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* STEP 3: DASHBOARD */}
      {step === 'DASHBOARD' && (
        <div className="animate-fade-in">
          <div className="loans-header">
            <div>
              <h2>Settlement <span className="gradient-text">Dashboard</span></h2>
              <p>
                Connected via Setu AA. Linked Client Profile: <strong>{customerName}</strong> ({mobile})
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem' }} onClick={handleReset}>
                <RefreshCw size={16} /> Sync Files
              </button>
              <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', border: '1px solid #ef4444', color: '#ef4444' }} onClick={() => setStep('LOGIN')}>
                Disconnect Profile
              </button>
            </div>
          </div>

          {/* Toggle Tabs */}
          <div className="dashboard-tabs" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
            <button 
              className={`tab-btn ${activeTab === 'ACTIVE' ? 'active-tab' : ''}`}
              onClick={() => setActiveTab('ACTIVE')}
              style={{
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-heading)',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                color: activeTab === 'ACTIVE' ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab === 'ACTIVE' ? '2px solid #09090b' : 'none'
              }}
            >
              Active Liabilities ({activeLoans.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'SETTLED' ? 'active-tab' : ''}`}
              onClick={() => setActiveTab('SETTLED')}
              style={{
                background: 'transparent',
                border: 'none',
                fontFamily: 'var(--font-heading)',
                fontSize: '1.1rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0.5rem 1rem',
                color: activeTab === 'SETTLED' ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab === 'SETTLED' ? '2px solid #09090b' : 'none'
              }}
            >
              Closed Accounts ({settledLoans.length})
            </button>
          </div>

          {/* Accounts Grid */}
          {activeTab === 'ACTIVE' ? (
            activeLoans.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '4rem 2rem' }}>
                <CheckCircle size={48} color="#10b981" style={{ marginBottom: '1.2rem' }} />
                <h3>No Active Liabilities</h3>
                <p style={{ color: 'var(--text-muted)' }}>All linked loan accounts have been fully settled, cleared, and closed.</p>
              </div>
            ) : (
              <div className="grid-container">
                {activeLoans.map(loan => {
                  const isNpa = loan.dpd >= 90
                  const isSma = loan.dpd >= 30 && loan.dpd < 90
                  const isSettlementMandate = loan.hasActiveSettlementMandate
                  
                  const statusBadgeColor = isSettlementMandate ? '#3b82f6' : isNpa ? '#ef4444' : isSma ? '#f59e0b' : '#10b981'
                  const statusBadgeText = isSettlementMandate ? 'Settlement in Progress (EMI)' : isNpa ? 'Critical NPA' : isSma ? `SMA DPD ${loan.dpd}` : 'Standard / Current'
                  const statusBgColor = isSettlementMandate ? 'rgba(59, 130, 246, 0.08)' : isNpa ? 'rgba(239, 68, 68, 0.08)' : isSma ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)'
                  
                  return (
                    <div key={loan.id} className="glass-panel glass-panel-hoverable" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '1.8rem', borderLeft: `5px solid ${statusBadgeColor}` }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.3rem 0.6rem', borderRadius: '20px', background: statusBgColor, color: statusBadgeColor, textTransform: 'uppercase' }}>
                            {statusBadgeText}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', background: 'rgba(79, 70, 229, 0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                            {loan.category || (loan.type === 'CREDIT_CARD' ? 'Credit Card' : 'Personal Loan')}
                          </span>
                        </div>

                        <h3 style={{ marginBottom: '0.2rem' }}>{loan.billerName}</h3>
                        <p style={{ fontSize: '0.8rem', fontFamily: 'var(--font-heading)', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                          A/C No: {loan.loanAccountNumber}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', marginBottom: '1.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Total Outstanding</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatRupees(loan.totalOutstanding)}</span>
                          </div>
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.85 }}>
                            <span style={{ color: 'var(--text-muted)' }}>Principal Due</span>
                            <span>{formatRupees(loan.principalOutstanding)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', opacity: 0.85 }}>
                            <span style={{ color: 'var(--text-muted)' }}>Accrued Interest / Charges</span>
                            <span>{formatRupees(loan.interestOutstanding)}</span>
                          </div>

                          <div style={{ display: 'flex', justifyBetween: 'space-between', borderTop: '1px solid var(--glass-border)', paddingTop: '0.8rem', fontSize: '0.8rem' }}>
                            <div>
                              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Rate</span>
                              <span style={{ fontWeight: 600 }}>{loan.interestRate}% p.a.</span>
                            </div>
                            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                              <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Tenure Left</span>
                              <span style={{ fontWeight: 600 }}>{loan.remainingTenureMonths > 0 ? `${loan.remainingTenureMonths} mo` : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                      {loan.hasActiveSettlementMandate ? (
                        <button 
                          className="btn btn-secondary" 
                          style={{ width: '100%', padding: '0.7rem 1.2rem', fontSize: '0.9rem', border: '1px solid #3b82f6', color: '#3b82f6', display: 'flex', gap: '0.5rem', justifyContent: 'center', alignItems: 'center' }}
                          onClick={() => navigate('/autopay')}
                        >
                          View AutoPay Plan <ArrowRight size={16} />
                        </button>
                      ) : loan.dpd >= 90 ? (
                        <button 
                          className="btn btn-primary" 
                          style={{ width: '100%', padding: '0.7rem 1.2rem', fontSize: '0.9rem' }}
                          onClick={() => handleSettleNow(loan)}
                        >
                          Settle Account <TrendingDown size={16} />
                        </button>
                      ) : (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.7rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.4rem' }}>
                          <CheckCircle size={14} color="#10b981" /> Healthy - Ineligible for Settlement
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            settledLoans.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '4rem 2rem' }}>
                <FileText size={48} style={{ opacity: 0.3, marginBottom: '1.2rem' }} />
                <h3>No Settled Accounts</h3>
                <p style={{ color: 'var(--text-muted)' }}>When you settle an outstanding liability, it will appear here along with its No Due Certificate.</p>
              </div>
            ) : (
              <div className="grid-container">
                {settledLoans.map(loan => (
                  <div key={loan.id} className="glass-panel" style={{ padding: '1.8rem', borderLeft: '5px solid #10b981', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.3rem 0.6rem', borderRadius: '20px', background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', textTransform: 'uppercase' }}>
                          Settled & Closed
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', background: 'rgba(16, 185, 129, 0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                          {loan.category || (loan.type === 'CREDIT_CARD' ? 'Credit Card' : 'Personal Loan')}
                        </span>
                      </div>

                      <h3 style={{ marginBottom: '0.2rem' }}>{loan.billerName}</h3>
                      <p style={{ fontSize: '0.8rem', fontFamily: 'var(--font-heading)', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        A/C No: {loan.loanAccountNumber}
                      </p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.8rem', fontSize: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Settled Value</span>
                          <span style={{ fontWeight: 700, color: '#10b981' }}>{formatRupees(loan.settledAmount)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Original Due</span>
                          <span style={{ textDecoration: 'line-through' }}>{formatRupees(loan.totalOutstanding)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Closed Date</span>
                          <span style={{ fontWeight: 600 }}>{loan.settledAt ? new Date(loan.settledAt).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <button 
                      className="btn btn-secondary" 
                      style={{ width: '100%', borderColor: '#10b981', color: '#10b981', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
                      onClick={() => {
                        setSelectedLoan(loan)
                        setSettledResult({
                          success: true,
                          ndcId: `NDC-PREVIEW-${loan.loanAccountNumber}`,
                          settledAt: loan.settledAt,
                          settledAmount: loan.settledAmount,
                          loan: {
                            loanAccountNumber: loan.loanAccountNumber,
                            billerName: loan.billerName,
                            customerName: customerName
                          }
                        })
                        setStep('SUCCESS')
                      }}
                    >
                      <FileText size={16} /> View No Due Certificate
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* STEP 4: CALCULATING PROP ENGINE ANIMATION */}
      {step === 'CALCULATING' && (
        <div className="loading-wrapper animate-fade-in" style={{ padding: '6rem 2rem' }}>
          <div className="spinner"></div>
          <h2>ArisX Calculation Desk</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '1rem auto' }}>
            Pulling credit history, aging statistics, and evaluating lender NPA haircut guidelines...
          </p>
          <div className="progress-bar-container">
            <div className="progress-bar"></div>
          </div>
        </div>
      )}

      {/* STEP 5: PROPOSAL DETAILS */}
      {step === 'DETAILS' && quote && (
        <div className="animate-fade-in">
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', marginBottom: '2rem' }} onClick={() => setStep('DASHBOARD')}>
            <ArrowLeft size={16} /> Back to Dashboard
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="glass-panel" style={{ border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Repayment Settlement Offer</span>
                  <h2 style={{ margin: 0, marginTop: '0.2rem' }}>Haircut & Discount Calculation</h2>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', fontWeight: 800, padding: '0.6rem 1.2rem', borderRadius: '12px', fontSize: '1.1rem' }}>
                  {((quote.totalDiscount / quote.totalOutstanding) * 100).toFixed(0)}% OFF Total Due
                </div>
              </div>

              <div className="checkout-container">
                {/* Breakdowns */}
                <div>
                  <h3 style={{ marginBottom: '1.2rem' }}>Liabilities Breakdown</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {/* Principal Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem' }}>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block' }}>Principal Outstanding</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Base Loan Debt</span>
                      </div>
                      <div className="text-right">
                        <span style={{ display: 'block', color: 'var(--text-muted)' }}>Original</span>
                        <span>{formatRupees(quote.principalOutstanding)}</span>
                      </div>
                      <div className="text-right" style={{ color: '#10b981', fontWeight: 600 }}>
                        <span style={{ display: 'block', fontSize: '0.75rem' }}>Discount ({quote.principalDiscountPct}%)</span>
                        <span>- {formatRupees(quote.principalDiscount)}</span>
                      </div>
                    </div>

                    {/* Interest Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem' }}>
                      <div>
                        <span style={{ fontWeight: 600, display: 'block' }}>Interest & Charges</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Accrued Interest / DPD charges</span>
                      </div>
                      <div className="text-right">
                        <span style={{ display: 'block', color: 'var(--text-muted)' }}>Original</span>
                        <span>{formatRupees(quote.interestOutstanding)}</span>
                      </div>
                      <div className="text-right" style={{ color: '#10b981', fontWeight: 600 }}>
                        <span style={{ display: 'block', fontSize: '0.75rem' }}>Discount ({quote.interestDiscountPct}%)</span>
                        <span>- {formatRupees(quote.interestDiscount)}</span>
                      </div>
                    </div>

                    {/* Total Summary Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', paddingTop: '0.5rem', fontWeight: 700 }}>
                      <div>
                        <span>Aggregate Amount</span>
                      </div>
                      <div className="text-right">
                        <span>{formatRupees(quote.totalOutstanding)}</span>
                      </div>
                      <div className="text-right" style={{ color: '#10b981' }}>
                        <span>- {formatRupees(quote.totalDiscount)}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.1)', borderRadius: '12px', padding: '1rem', marginTop: '2rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <Info size={20} color="#6366f1" />
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                      The calculation parameters applied represent the NPA resolution standard for <strong>{quote.category}</strong>. All outstanding liabilities on account <strong>{quote.loanAccountNumber}</strong> will be fully extinguished upon payment.
                    </p>
                  </div>

                  <div style={{ marginTop: '2rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>Choose Payment Option</h3>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <label 
                        style={{
                          flex: 1,
                          minWidth: '220px',
                          border: paymentOption === 'FULL' ? '2px solid #10b981' : '1px solid var(--glass-border)',
                          background: paymentOption === 'FULL' ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                          borderRadius: '12px',
                          padding: '1.2rem',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                          <input 
                            type="radio" 
                            name="paymentOption" 
                            value="FULL" 
                            checked={paymentOption === 'FULL'} 
                            onChange={() => setPaymentOption('FULL')} 
                            style={{ accentColor: '#10b981' }}
                          />
                          <span>Pay in Full</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Clear the entire settled amount of {formatRupees(quote.settlementAmount)} immediately.
                        </span>
                      </label>

                      <label 
                        style={{
                          flex: 1,
                          minWidth: '220px',
                          border: paymentOption === 'EMI' ? '2px solid #10b981' : '1px solid var(--glass-border)',
                          background: paymentOption === 'EMI' ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                          borderRadius: '12px',
                          padding: '1.2rem',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                          <input 
                            type="radio" 
                            name="paymentOption" 
                            value="EMI" 
                            checked={paymentOption === 'EMI'} 
                            onChange={() => setPaymentOption('EMI')} 
                            style={{ accentColor: '#10b981' }}
                          />
                          <span>Equated Monthly EMI</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Setup a monthly UPI Auto Mandate to pay in equated installments.
                        </span>
                      </label>
                    </div>

                    {paymentOption === 'EMI' && (
                      <div className="animate-fade-in" style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.2rem' }}>
                        <label className="form-label" style={{ fontWeight: 700, marginBottom: '0.6rem', display: 'block' }}>Select Tenure</label>
                        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                          {[3, 6, 9, 12].map((tenure) => (
                            <button
                              key={tenure}
                              type="button"
                              className={`btn ${tenureMonths === tenure ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ flex: 1, padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                              onClick={() => setTenureMonths(tenure)}
                            >
                              {tenure} Months
                            </button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--glass-border)', marginTop: '1.2rem', paddingTop: '1rem', fontSize: '0.9rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Calculated Monthly EMI:</span>
                          <strong style={{ color: '#10b981', fontSize: '1.1rem' }}>
                            {formatRupees(Math.floor(quote.settlementAmount / tenureMonths))} / month
                          </strong>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Offer Sidebar */}
                <div className="glass-panel" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                  <div>
                    <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>Final Quote</h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div className="summary-row">
                        <span className="invoice-lbl">Lender</span>
                        <span className="invoice-val">{quote.billerName}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Account Type</span>
                        <span className="invoice-val">{quote.type}</span>
                      </div>
                      <div className="summary-row">
                        <span className="invoice-lbl">Credit Aging Status</span>
                        <span className="invoice-val" style={{ color: quote.dpd >= 90 ? '#ef4444' : '#f59e0b' }}>{quote.dpd} DPD</span>
                      </div>
                      
                      <div className="summary-row" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '0.8rem' }}>
                        <span className="invoice-lbl">Original Payable</span>
                        <span>{formatRupees(quote.totalOutstanding)}</span>
                      </div>
                      <div className="summary-row" style={{ color: '#10b981', fontWeight: 600 }}>
                        <span className="invoice-lbl">Haircut Savings</span>
                        <span>- {formatRupees(quote.totalDiscount)}</span>
                      </div>

                      <div className="summary-row summary-total">
                        <span>Settlement Net Cost</span>
                        <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>
                          {formatRupees(quote.settlementAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Real-time Score Simulation Display */}
                    <div style={{
                      padding: '1.2rem',
                      background: 'var(--bg-primary)',
                      borderRadius: '12px',
                      border: '1px solid var(--glass-border)',
                      boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                      marginBottom: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <h5 style={{ fontSize: '0.8rem', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.8rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Shield size={14} strokeWidth={2.5} /> Experian Score Simulation
                      </h5>
                      
                      {simulationLoading && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Running credit simulation matrix...</span>
                        </div>
                      )}

                      {!simulationLoading && simulationResult && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                              {simulationResult.simulation_engine?.simulated_score}{' '}
                              <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ 900</span>
                            </div>
                            <div style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: simulationResult.simulation_engine?.projected_delta >= 0 ? '#10b981' : '#ef4444',
                              background: simulationResult.simulation_engine?.projected_delta >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '10px'
                            }}>
                              {simulationResult.simulation_engine?.projected_delta >= 0 ? '+' : ''}{simulationResult.simulation_engine?.projected_delta} Points
                            </div>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.6rem', lineHeight: '1.4', margin: 0 }}>
                            {simulationResult.simulation_engine?.educational_insight}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    className="btn btn-success" 
                    style={{ width: '100%', background: '#10b981' }} 
                    onClick={handleProceedToPayment}
                    disabled={loading}
                  >
                    {loading ? 'Processing...' : 'Accept Offer & Pay'} <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 6: SIMULATED PAYMENT FOR SETTLEMENT */}
      {step === 'PAYMENT' && quote && (
        <div className="glass-panel simulate-wrapper animate-fade-in" style={{ padding: '3rem 2rem' }}>
          <h2 className="simulate-gateway-title">Gateway Payment Simulation</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Simulate a direct clearing house payment for the settled value of <strong>{formatRupees(quote.settlementAmount)}</strong> to permanently close the account.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', textAlign: 'left', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Lender Bank</span>
              <span style={{ fontWeight: 600 }}>{quote.billerName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Settlement A/C No</span>
              <span style={{ fontWeight: 600 }}>{quote.loanAccountNumber}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem' }}>
              <span style={{ fontWeight: 'bold' }}>Clearance Amount</span>
              <span style={{ fontWeight: 'bold', color: '#10b981' }}>{formatRupees(quote.settlementAmount)}</span>
            </div>
          </div>

          <div className="form-group" style={{ textAlign: 'left' }}>
            <label className="form-label">Select Clearing Instrument</label>
            <div className="gateway-options">
              <button 
                type="button" 
                className={`gateway-btn ${paymentGateway === 'GPay' ? 'border-primary' : ''}`}
                style={{ border: paymentGateway === 'GPay' ? '2px solid #09090b' : '1px solid var(--glass-border)' }}
                onClick={() => setPaymentGateway('GPay')}
              >
                <div className="gateway-btn-left">
                  <div className="gateway-logo-placeholder gpay-logo">G</div>
                  <span>Google Pay (UPI Simulation)</span>
                </div>
                {paymentGateway === 'GPay' && <CheckCircle size={18} color="#09090b" />}
              </button>

              <button 
                type="button" 
                className={`gateway-btn ${paymentGateway === 'PhonePe' ? 'border-primary' : ''}`}
                style={{ border: paymentGateway === 'PhonePe' ? '2px solid #09090b' : '1px solid var(--glass-border)' }}
                onClick={() => setPaymentGateway('PhonePe')}
              >
                <div className="gateway-btn-left">
                  <div className="gateway-logo-placeholder phonepe-logo">P</div>
                  <span>PhonePe (UPI Simulation)</span>
                </div>
                {paymentGateway === 'PhonePe' && <CheckCircle size={18} color="#09090b" />}
              </button>

              <button 
                type="button" 
                className={`gateway-btn ${paymentGateway === 'Razorpay' ? 'border-primary' : ''}`}
                style={{ border: paymentGateway === 'Razorpay' ? '2px solid #09090b' : '1px solid var(--glass-border)' }}
                onClick={() => setPaymentGateway('Razorpay')}
              >
                <div className="gateway-btn-left">
                  <div className="gateway-logo-placeholder razorpay-logo">R</div>
                  <span>Razorpay (Instant NetBanking Clearance)</span>
                </div>
                {paymentGateway === 'Razorpay' && <CheckCircle size={18} color="#09090b" />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
            <button 
              type="button" 
              className="btn btn-secondary" 
              style={{ flex: 1 }}
              onClick={() => setStep('DETAILS')}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="button" 
              className="btn btn-primary" 
              style={{ flex: 1, background: '#10b981' }}
              onClick={handleConfirmPayment}
              disabled={loading}
            >
              {loading ? 'Clearing Account...' : 'Approve Settlement'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 7: SUCCESS VIEW & NO DUE CERTIFICATE (NDC) */}
      {step === 'SUCCESS' && settledResult && (
        <div className="animate-fade-in text-center">
          
          <div className="no-print" style={{ marginBottom: '2rem' }}>
            <div className="checkmark-container">
              <div className="checkmark" style={{ stroke: '#10b981', boxShadow: 'inset 0 0 0 50px rgba(16, 185, 129, 0.05)' }}>
                <svg className="checkmark__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                  <circle className="checkmark__circle" cx="26" cy="26" r="25" fill="none" style={{ stroke: '#10b981' }} />
                  <path className="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" style={{ stroke: '#10b981' }} />
                </svg>
              </div>
            </div>
            <h2>Account Cleared & Settled Successfully</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Your payment has been cleared. The financial account is now permanently closed, and your credit file has been updated.
            </p>
          </div>

          {/* PRINTABLE NDC CERTIFICATE */}
          <div className="ndc-certificate-wrapper" style={{ margin: '2rem auto', maxWidth: '700px' }}>
            <div className="ndc-card" style={{
              background: '#fff',
              color: '#000',
              border: '4px double #1f2937',
              borderRadius: '8px',
              padding: '3rem 2.5rem',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              textAlign: 'center',
              position: 'relative',
              fontFamily: '"Cinzel", "Georgia", serif'
            }}>
              {/* Border decoration */}
              <div style={{ position: 'absolute', top: '10px', bottom: '10px', left: '10px', right: '10px', border: '1px solid rgba(31, 41, 55, 0.2)', pointerEvents: 'none' }}></div>
              
              <div style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.5rem' }}>
                Official Clearance Document
              </div>
              <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: '0.2rem 0', fontFamily: 'serif', letterSpacing: '0.05em' }}>NO DUE CERTIFICATE</h1>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '2rem' }}>
                NDC ID: <strong>{settledResult.ndcId}</strong> | Issued on: {settledResult.settledAt ? new Date(settledResult.settledAt).toLocaleDateString() : new Date().toLocaleDateString()}
              </div>

              <div style={{ textAlign: 'left', lineHeight: '1.8', fontSize: '0.95rem', margin: '2rem 0', fontFamily: 'sans-serif', color: '#1f2937' }}>
                <p style={{ marginBottom: '1.2rem' }}>
                  This document certifies that the customer <strong>{settledResult.loan?.customerName || customerName}</strong>, holding registered mobile file <strong>{mobile}</strong>, has paid the final settled clearance value of <strong>{formatRupees(settledResult.settledAmount)}</strong>.
                </p>
                <p style={{ marginBottom: '1.2rem' }}>
                  Lender Bank: <strong>{settledResult.loan?.billerName}</strong> <br />
                  Settled Account Number: <strong>{settledResult.loan?.loanAccountNumber}</strong> <br />
                  Liability Type: <strong>Credit Liability (Extinguished)</strong>
                </p>
                <p>
                  Upon clearance of the aforementioned settlement amount, the lender bank hereby declares that there are <strong>no further outstanding dues</strong> against the borrower on this account. The liability stands fully discharged, and the account status is updated to <strong>'Closed' / 'Settled'</strong>.
                </p>
              </div>

              {/* Signatures & Stamp */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3.5rem', borderTop: '1px dashed #d1d5db', paddingTop: '1.5rem', fontFamily: 'sans-serif' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ height: '35px', fontFamily: 'cursive', fontSize: '1.1rem', color: '#1d4ed8' }}>ArisX Desk</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#4b5563' }}>Authorized Signatory</div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>Clearing House Agent</div>
                </div>

                {/* Stamp */}
                <div style={{
                  border: '3px solid #dc2626',
                  color: '#dc2626',
                  borderRadius: '50%',
                  width: '90px',
                  height: '90px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  transform: 'rotate(-12deg)',
                  opacity: 0.85,
                  letterSpacing: '0.05em'
                }}>
                  <div style={{ borderBottom: '1px solid #dc2626', paddingBottom: '2px', marginBottom: '2px', fontWeight: 900 }}>CLOSED</div>
                  <div>ARISX</div>
                  <div style={{ fontSize: '0.5rem' }}>SETTLED</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ height: '35px', fontFamily: 'cursive', fontSize: '1.1rem', color: '#4b5563' }}>Setu Clearing</div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: '#4b5563' }}>Setu BBPS Gateway</div>
                  <div style={{ fontSize: '0.65rem', color: '#9ca3af' }}>System Authenticated</div>
                </div>
              </div>
            </div>
          </div>

          <div className="no-print" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2.5rem' }}>
            <button className="btn btn-secondary" onClick={handleReset}>
              <ArrowLeft size={16} /> Return to Dashboard
            </button>
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
