import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Shield, CheckCircle2, XOctagon, RefreshCw, Trash2, ArrowRight, PlusCircle, AlertCircle, X, History } from 'lucide-react'
import { isAuthenticated, getUser, authFetch } from '../utils/auth'

export default function AutopayDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const { preSelectedLoanId } = location.state || {}

  const [mobile, setMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [mandates, setMandates] = useState([])
  const [loans, setLoans] = useState([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState('')
  
  // Per-loan action states
  const [activeSetupLoanId, setActiveSetupLoanId] = useState(null)
  const [maxAmounts, setMaxAmounts] = useState({}) // { [loanId]: '15000' }
  const [setupLoading, setSetupLoading] = useState({}) // { [loanId]: boolean }
  const [revokingId, setRevokingId] = useState(null)

  // Credit score simulation states
  const [simulationResult, setSimulationResult] = useState(null)
  const [simulationLoading, setSimulationLoading] = useState(false)

  // Details Modal States
  const [selectedMandate, setSelectedMandate] = useState(null)
  const [mandateDebits, setMandateDebits] = useState([])
  const [debitsLoading, setDebitsLoading] = useState(false)

  // Run simulation whenever activeSetupLoanId changes
  useEffect(() => {
    if (!activeSetupLoanId) {
      setSimulationResult(null)
      return
    }

    const selectedLoan = loans.find(l => l.id === activeSetupLoanId)
    if (!selectedLoan) return

    setSimulationLoading(true)
    setSimulationResult(null)

    const u = getUser()
    if (!u) {
      setSimulationLoading(false)
      return
    }

    authFetch('/api/intelligence/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        firstName: u.first_name || 'User',
        lastName: u.last_name || '',
        mobileNumber: u.mobile,
        pan: u.pan,
        consentFlag: true,
        consentTimestamp: Math.floor(Date.now() / 1000),
        simulatedAction: {
          actionType: 'UPI_MANDATE',
          monetaryValue: 0,
          targetAccountType: selectedLoan.type || 'PERSONAL_LOAN'
        }
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Simulation failed')
        return res.json()
      })
      .then(data => {
        setSimulationResult(data)
        setSimulationLoading(false)
      })
      .catch(err => {
        console.error(err)
        setSimulationLoading(false)
      })
  }, [activeSetupLoanId, loans])

  // Auto-load if user is logged in
  useEffect(() => {
    if (isAuthenticated()) {
      const u = getUser()
      if (u) {
        setMobile(u.mobile)
        performSearch(u.mobile)
      }
    }
  }, [])

  const performSearch = (searchMobile) => {
    setLoading(true)
    setError('')
    setSearched(true)
    setActiveSetupLoanId(null)

    // Fetch both mandates and loans concurrently
    Promise.all([
      authFetch(`/api/mandates/list?mobile=${searchMobile}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch mandates')
        return res.json()
      }),
      authFetch(`/api/mandates/eligible-loans?mobile=${searchMobile}`).then(res => {
        if (!res.ok) throw new Error('Failed to fetch loans')
        return res.json()
      })
    ])
      .then(([mandateData, loanData]) => {
        setMandates(mandateData)
        setLoans(loanData)
        
        // Pre-fill default max amounts for each loan
        const initialMaxs = {}
        loanData.forEach(l => {
          initialMaxs[l.id] = '15000'
        })
        setMaxAmounts(initialMaxs)
        
        // Auto-select setup if redirected from Home screen
        if (preSelectedLoanId) {
          setActiveSetupLoanId(preSelectedLoanId)
        }
        
        setLoading(false)
      })
      .catch(err => {
        setLoading(false)
        setError(err.message || 'Error loading dashboard details.')
      })
  }

  const handleSearch = (e) => {
    if (e) e.preventDefault()
    if (!mobile || mobile.length !== 10) {
      setError('Please enter a valid 10-digit mobile number')
      return
    }
    performSearch(mobile)
  }

  const handleOpenDetails = (mandate) => {
    setSelectedMandate(mandate)
    setDebitsLoading(true)
    setMandateDebits([])

    authFetch(`/api/mandates/${mandate.setu_mandate_id}/debits`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load debits history')
        return res.json()
      })
      .then(data => {
        setMandateDebits(data)
        setDebitsLoading(false)
      })
      .catch(err => {
        console.error(err)
        setDebitsLoading(false)
      })
  }

  const handleInitiateSetup = (loan) => {
    const limit = maxAmounts[loan.id] || '15000'
    const amount_paise = parseInt(limit) * 100
    if (isNaN(amount_paise) || amount_paise <= 0) {
      alert('Please enter a valid maximum cap amount')
      return
    }

    setSetupLoading(prev => ({ ...prev, [loan.id]: true }))

    authFetch('/api/mandates/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        loan_id: loan.id,
        max_amount_paise: amount_paise
      })
    })
      .then(res => {
        if (!res.ok) throw new Error('Mandate creation failed')
        return res.json()
      })
      .then(data => {
        setSetupLoading(prev => ({ ...prev, [loan.id]: false }))
        navigate('/mandate/checkout', {
          state: {
            setuMandateId: data.setu_mandate_id,
            intentUrl: data.intent_url,
            loanId: loan.id,
            maxAmountPaise: amount_paise,
            biller: { id: loan.biller_id, name: loan.biller_name },
            fetchSessionId: null // initiated from dashboard
          }
        })
      })
      .catch(err => {
        setSetupLoading(prev => ({ ...prev, [loan.id]: false }))
        alert(err.message || 'Error initiating mandate setup.')
      })
  }

  const handleRevoke = (setuMandateId) => {
    if (!window.confirm("Are you sure you want to disable and revoke this AutoPay mandate? Future automatic EMI recoveries will stop.")) return
    
    setRevokingId(setuMandateId)
    authFetch(`/api/mandates/simulate-revocation/${setuMandateId}`, {
      method: 'POST'
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to revoke mandate')
        return res.json()
      })
      .then(data => {
        setRevokingId(null)
        setSelectedMandate(null) // Close details modal if open
        alert('AutoPay revocation simulated successfully! Updating list...');
        performSearch(mobile) // Refresh dashboard
      })
      .catch(err => {
        setRevokingId(null)
        alert(err.message || 'Error revoking mandate.')
      })
  }

  const formatRupees = (paise) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  // Filter loans that do NOT have an active mandate
  const eligibleLoansForNewSetup = loans.filter(loan => {
    if (loan.status === 'SETTLED') return false
    
    const hasActiveMandate = mandates.some(
      m => m.loan_account_number === loan.loan_account_number && m.status === 'ACTIVE'
    )
    return !hasActiveMandate
  })

  // Filter active mandates
  const activeMandates = mandates.filter(m => m.status === 'ACTIVE')
  
  // Filter inactive/revoked mandates
  const historyMandates = mandates.filter(m => m.status !== 'ACTIVE')

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      <div className="loans-header">
        <div>
          <h2>AutoPay <span className="gradient-text">Command Center</span></h2>
          <p>Retrieve, manage, or set up new recurring payment mandates for your loans in one place.</p>
        </div>
      </div>

      {/* Mobile Search Form */}
      <div className="glass-panel" style={{ marginBottom: '2.5rem', padding: '2rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label className="invoice-lbl" htmlFor="dashboard-mobile">Registered Mobile Number</label>
            <input 
              id="dashboard-mobile"
              type="text" 
              className="form-input"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').substring(0, 10))}
              placeholder="e.g. 9876543210"
              maxLength={10}
            />
          </div>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: '0.8rem 1.8rem', height: 'fit-content', cursor: 'pointer' }}
            disabled={loading}
          >
            {loading ? 'Searching...' : 'Retrieve Accounts'}
          </button>
        </form>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-wrapper" style={{ padding: '4rem 2rem' }}>
          <div className="spinner"></div>
          <p>Querying active UPI AutoPay and loan records...</p>
        </div>
      ) : searched ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          
          {/* SECTION 1: ELIGIBLE LOANS FOR NEW SETUP */}
          <div>
            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <PlusCircle size={20} color="#6366f1" />
              <span>Set Up New AutoPay Mandate</span>
            </h3>
            
            {eligibleLoansForNewSetup.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={32} color="#10b981" style={{ marginBottom: '0.5rem', display: 'inline' }} />
                <p>All active loans under this mobile number are already linked to an active AutoPay mandate!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {eligibleLoansForNewSetup.map((loan) => {
                  const isSetupActive = activeSetupLoanId === loan.id
                  const isInitiating = setupLoading[loan.id] || false
                  
                  return (
                    <div 
                      key={loan.id} 
                      className="glass-panel" 
                      style={{ 
                        border: '1px solid rgba(99, 102, 241, 0.15)',
                        padding: '1.5rem',
                        background: 'rgba(99, 102, 241, 0.01)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {loan.biller_name}
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', background: 'rgba(79, 70, 229, 0.06)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                              {loan.category || 'Personal Loan'}
                            </span>
                          </h4>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Account No: {loan.loan_account_number} | Outstanding: {formatRupees(loan.total_outstanding)}
                          </div>
                        </div>

                        {!isSetupActive ? (
                          <button 
                            className="btn btn-primary" 
                            style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem', cursor: 'pointer' }}
                            onClick={() => setActiveSetupLoanId(loan.id)}
                          >
                            Setup AutoPay
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.5rem 1.2rem', fontSize: '0.85rem', cursor: 'pointer' }}
                              onClick={() => setActiveSetupLoanId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Expanded setup inputs */}
                      {isSetupActive && (
                        <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px dashed var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          
                          {/* Real-time Score Simulation Display */}
                          <div style={{
                            padding: '1.2rem',
                            background: 'var(--bg-primary)',
                            borderRadius: '12px',
                            border: '1px solid var(--glass-border)',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                            marginBottom: '0.5rem'
                          }}>
                            <h5 style={{ fontSize: '0.8rem', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.8rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <Shield size={14} strokeWidth={2.5} /> Experian Score Simulation
                            </h5>
                            
                            {simulationLoading && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Running credit-scoring simulation matrix...</span>
                              </div>
                            )}

                            {!simulationLoading && simulationResult && (
                              <div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                                    {simulationResult.simulation_engine?.simulated_score}{' '}
                                    <span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ 900</span>
                                  </div>
                                  <div style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: '#10b981',
                                    background: 'rgba(16, 185, 129, 0.08)',
                                    padding: '0.2rem 0.6rem',
                                    borderRadius: '10px'
                                  }}>
                                    +{simulationResult.simulation_engine?.projected_delta} Points (Projected Change)
                                  </div>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.6rem', lineHeight: '1.5' }}>
                                  {simulationResult.simulation_engine?.educational_insight}
                                </p>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              <label className="invoice-lbl" htmlFor={`limit-${loan.id}`}>Maximum Monthly Cap Limit (INR)</label>
                              <input 
                                id={`limit-${loan.id}`}
                                type="number" 
                                className="form-input" 
                                style={{ padding: '0.6rem' }}
                                value={maxAmounts[loan.id] || '15000'}
                                onChange={(e) => setMaxAmounts({ ...maxAmounts, [loan.id]: e.target.value })}
                                placeholder="e.g. 15000"
                              />
                            </div>
                            <button 
                              className="btn btn-primary" 
                              style={{ padding: '0.6rem 1.5rem', cursor: 'pointer' }}
                              onClick={() => handleInitiateSetup(loan)}
                              disabled={isInitiating}
                            >
                              {isInitiating ? 'Redirecting...' : 'Confirm & Authorize'}
                            </button>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
                            Automatically schedules collections using Setu's UPI AutoPay network. Secure and certified by NPCI.
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* SECTION 2: ACTIVE AUTOPAY MANDATES */}
          <div>
            <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} color="#10b981" />
              <span>Active AutoPay Mandates <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Click to view payments history)</span></span>
            </h3>
            
            {activeMandates.length === 0 ? (
              <div className="glass-panel text-center" style={{ padding: '2rem', color: 'var(--text-muted)' }}>
                <p>No active AutoPay mandates linked to loans under this mobile number.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {activeMandates.map((m) => (
                  <div 
                    key={m.id} 
                    className="glass-panel glass-panel-hoverable" 
                    style={{ borderLeft: '4px solid #10b981', padding: '1.5rem', cursor: 'pointer' }}
                    onClick={() => handleOpenDetails(m)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem', marginBottom: '0.8rem' }}>
                      <div>
                        <h4 style={{ margin: 0 }}>{m.biller_name}</h4>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loan Account: {m.loan_account_number}</div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '20px', border: '1px solid rgba(16, 185, 129, 0.2)', fontWeight: 600 }}>
                        Active
                      </span>
                    </div>

                    <div className="loan-details-grid">
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">UMN</div>
                        <div className="loan-detail-val" style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.umn}</div>
                      </div>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Max Limit</div>
                        <div className="loan-detail-val">{formatRupees(m.max_amount_paise)}</div>
                      </div>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Linked VPA</div>
                        <div className="loan-detail-val">{m.customer_vpa || 'customer@upi'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: INACTIVE / HISTORY MANDATES */}
          {historyMandates.length > 0 && (
            <div>
              <h3 style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: 0.7 }}>
                <AlertCircle size={20} color="var(--text-muted)" />
                <span>Mandate History <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Click to view payments history)</span></span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', opacity: 0.75 }}>
                {historyMandates.map((m) => (
                  <div 
                    key={m.id} 
                    className="glass-panel glass-panel-hoverable" 
                    style={{ borderLeft: '4px solid #ef4444', padding: '1rem 1.5rem', background: 'rgba(255,255,255,0.01)', cursor: 'pointer' }}
                    onClick={() => handleOpenDetails(m)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{m.biller_name}</h4>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Account: {m.loan_account_number} | UMN: {m.umn || 'N/A'}</div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', padding: '0.1rem 0.5rem', borderRadius: '20px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                        Revoked
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className="glass-panel text-center" style={{ padding: '3.5rem 2rem' }}>
          <Shield size={54} color="#6366f1" style={{ marginBottom: '1.2rem', filter: 'drop-shadow(var(--glow-primary))' }} />
          <h3>Secure AutoPay Command Center</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '550px', margin: '0.5rem auto 1.5rem auto' }}>
            Input the borrower's registered mobile number above to manage existing active mandates, audit history, or directly link uncovered loan accounts to new automatic EMI recovery plans.
          </p>
        </div>
      )}

      {/* DETAILS & PAYMENT AUDIT MODAL OVERLAY */}
      {selectedMandate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '1.5rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: '20px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '2.5rem',
            boxShadow: '0 20px 60px rgba(9, 9, 11, 0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            position: 'relative'
          }}>
            {/* Close Button */}
            <button 
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
              onClick={() => setSelectedMandate(null)}
            >
              <X size={24} />
            </button>

            <div>
              <h3 style={{ margin: 0, fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Shield size={24} color="#6366f1" /> Mandate Details
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                Technical parameters and collection schedule for Setu Subscription.
              </p>
            </div>

            {/* Technical Parameters Info Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.2rem',
              padding: '1.2rem',
              background: 'rgba(9, 9, 11, 0.01)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px'
            }}>
              <div>
                <div className="loan-detail-label">Loan Provider</div>
                <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{selectedMandate.biller_name}</div>
              </div>
              <div>
                <div className="loan-detail-label">Loan Account</div>
                <div style={{ fontWeight: 700, marginTop: '0.2rem' }}>{selectedMandate.loan_account_number}</div>
              </div>
              <div>
                <div className="loan-detail-label">Maximum Debit Cap</div>
                <div style={{ fontWeight: 700, marginTop: '0.2rem', color: '#10b981' }}>{formatRupees(selectedMandate.max_amount_paise)}</div>
              </div>
              <div>
                <div className="loan-detail-label">Unique Mandate No (UMN)</div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.2rem' }}>{selectedMandate.umn || 'N/A'}</div>
              </div>
              <div>
                <div className="loan-detail-label">Setu Mandate ID</div>
                <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.2rem' }}>{selectedMandate.setu_mandate_id}</div>
              </div>
              <div>
                <div className="loan-detail-label">Mandate Status</div>
                <div style={{ marginTop: '0.2rem' }}>
                  {selectedMandate.status === 'ACTIVE' ? (
                    <span style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>Active</span>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.1rem 0.5rem', borderRadius: '10px', fontWeight: 600 }}>Revoked</span>
                  )}
                </div>
              </div>
            </div>

            {/* Payments History Section */}
            <div>
              <h4 style={{ margin: '0 0 0.8rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <History size={18} color="var(--text-muted)" />
                <span>Automatic Payment Log</span>
              </h4>

              {debitsLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>
                  <div className="spinner" style={{ width: '30px', height: '30px', borderWidth: '3px', margin: '0 auto' }}></div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Retrieving payments audit logs...</p>
                </div>
              ) : mandateDebits.length === 0 ? (
                <div style={{ padding: '1.5rem', border: '1px dashed var(--glass-border)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No payment attempts have been recorded under this mandate yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.3rem' }}>
                  {mandateDebits.map(d => {
                    const isSuccess = d.status === 'SUCCESS'
                    return (
                      <div 
                        key={d.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.8rem 1rem', 
                          background: 'rgba(255,255,255,0.01)', 
                          border: '1px solid var(--glass-border)', 
                          borderRadius: '8px' 
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{formatRupees(d.amount_paise)}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ID: {d.setu_debit_id || 'PENDING'} | Date: {new Date(d.scheduled_at).toLocaleDateString()}
                          </div>
                          {d.error_message && (
                            <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.1rem' }}>
                              Error: {d.error_message}
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: '0.75rem',
                          color: isSuccess ? '#10b981' : d.status === 'FAILED' ? '#ef4444' : '#fbbf24',
                          fontWeight: 600
                        }}>
                          {d.status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Action buttons footer */}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, cursor: 'pointer' }}
                onClick={() => setSelectedMandate(null)}
              >
                Close details
              </button>
              {selectedMandate.status === 'ACTIVE' && (
                <button 
                  className="btn btn-secondary" 
                  style={{ border: '1px solid #ef4444', color: '#ef4444', flex: 1, cursor: 'pointer' }}
                  onClick={() => handleRevoke(selectedMandate.setu_mandate_id)}
                  disabled={revokingId === selectedMandate.setu_mandate_id}
                >
                  {revokingId === selectedMandate.setu_mandate_id ? 'Revoking...' : 'Revoke Autopay'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
