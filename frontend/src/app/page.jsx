'use client'

import React, { useState, useEffect } from 'react'
import { useNavigate } from '../utils/router'
import { ArrowRight, ShieldCheck, CreditCard, ChevronDown, ChevronUp, AlertCircle, Calendar, FileText } from 'lucide-react'
import { isAuthenticated, getUser, authFetch } from '../utils/auth'

export default function Home() {
  const navigate = useNavigate()
  const loggedIn = isAuthenticated()
  const user = getUser()

  // User Dashboard States
  const [currentUser, setCurrentUser] = useState(user)
  const [loans, setLoans] = useState([])
  const [billers, setBillers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAllLoans, setShowAllLoans] = useState(false)

  // Fetch loans, profile, and billers list if logged in
  useEffect(() => {
    if (!loggedIn || !user) return

    setLoading(true)
    setError('')

    // Fetch user profile, loans, and billers list concurrently
    Promise.all([
      authFetch('/api/auth/me').then(res => {
        if (!res.ok) throw new Error('Failed to retrieve user profile.')
        return res.json()
      }),
      authFetch(`/api/mandates/eligible-loans?mobile=${user.mobile}`).then(res => {
        if (!res.ok) throw new Error('Failed to retrieve active credit files.')
        return res.json()
      }),
      authFetch('/api/billers').then(res => {
        if (!res.ok) throw new Error('Failed to load billers registry.')
        return res.json()
      })
    ])
      .then(([userData, loansData, billersData]) => {
        setCurrentUser(userData)
        localStorage.setItem('auth_user', JSON.stringify(userData))
        setLoans(loansData)
        setBillers(billersData)
        setLoading(false)
      })
      .catch(err => {
        console.error(err)
        setError(err.message || 'Error loading dashboard profiles.')
        setLoading(false)
      })
  }, [loggedIn])

  const getScoreDelta = (actionType, loanType) => {
    const activeCount = currentUser?.totalActiveAccounts || 3

    if (actionType === 'PAY_NOW') {
      if (loanType === 'CREDIT_CARD') {
        return '+45'
      } else {
        return activeCount === 1 ? '-10' : '+25'
      }
    } else if (actionType === 'SETTLE_NOW') {
      return activeCount === 1 ? '-10' : '+15'
    } else if (actionType === 'UPI_MANDATE') {
      return '+20'
    }
    return '0'
  }

  const formatRupees = (paise) => {
    if (paise === undefined || paise === null) return 'N/A'
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(paise / 100)
  }

  // Action: Pay Now (triggers BBPS Fetch and redirects to checkout)
  const handlePayNow = (loan) => {
    // 1. Find biller object
    const foundBiller = billers.find(b => b.id === loan.biller_id)
    if (!foundBiller) {
      alert('Biller metadata not found in central registry.')
      return
    }

    setLoading(true)

    // 2. Call initiate fetch
    const payload = {
      billerId: loan.biller_id,
      mobile: user.mobile,
      customerParams: {
        "Loan Account Number": loan.loan_account_number
      }
    }

    authFetch('/api/fetch/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to retrieve active bills.')
        }
        return data
      })
      .then((data) => {
        setLoading(false)
        navigate('/loans', {
          state: {
            fetchSessionId: data.fetchSessionId,
            biller: foundBiller
          }
        })
      })
      .catch(err => {
        setLoading(false)
        alert(err.message || 'Error triggering fetch request.')
      })
  }

  // Display only part of the list initially (e.g. 2 loans)
  const loansToShow = showAllLoans ? loans : loans.slice(0, 2)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

      {/* Hero Header Section */}
      <div className="hero-section">
        <div className="hero-content animate-fade-in">
          {loggedIn ? (
            <h1>
              Welcome Back, <br />
              <span className="gradient-text">{user?.first_name} {user?.last_name}</span>
            </h1>
          ) : (
            <h1>
              Simplify Your <br />
              <span className="gradient-text">Loan Repayments</span>
            </h1>
          )}
          <p className="hero-subtitle">
            Securely fetch, view, and pay your active Loan EMIs instantly through the Bharat Bill Payment System (BBPS) gateway.
          </p>

          {/* Action buttons (Sign In / Sign Up) if not logged in */}
          {!loggedIn && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate('/auth')}>
                Get Started <ArrowRight size={18} />
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/auth')}>
                Sign In
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '2rem', marginTop: '3.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', padding: '0.6rem', borderRadius: '10px' }}>
                <ShieldCheck size={20} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>NPCI Verified</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7', padding: '0.6rem', borderRadius: '10px' }}>
                <FileText size={20} />
              </div>
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Instant NOC</p>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Visual Minimalistic SVG Finance Dashboard */}
        <div className="hero-visual" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <style>{`
            @keyframes pulse-node {
              0% { transform: scale(0.9); opacity: 0.9; }
              50% { transform: scale(1.3); opacity: 0; }
              100% { transform: scale(0.9); opacity: 0; }
            }
            @keyframes float-card {
              0%, 100% { transform: translate(55px, 60px); }
              50% { transform: translate(55px, 50px); }
            }
            @keyframes float-node {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-4px); }
            }
            @keyframes grow-bar {
              0% { transform: scaleY(0.3); }
              100% { transform: scaleY(1); }
            }
          `}</style>
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '430px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'transform 0.5s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'none'
          }}>
            <svg viewBox="25 30 350 255" width="100%" height="100%" style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#09090b" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#09090b" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {/* Grid Lines (Subtle horizontal dashed guidelines only, no outer solid borders) */}
              <g opacity="0.08">
                <line x1="40" y1="100" x2="360" y2="100" stroke="#09090b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="40" y1="150" x2="360" y2="150" stroke="#09090b" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="40" y1="200" x2="360" y2="200" stroke="#09090b" strokeWidth="1" strokeDasharray="4 4" />
              </g>

              {/* Area Fill Under Curve */}
              <path d="M 40,220 C 100,210 150,140 200,130 C 250,120 300,70 360,60 L 360,250 L 40,250 Z" fill="url(#areaGrad)" />

              {/* Trend Curve Line */}
              <path d="M 40,220 C 100,210 150,140 200,130 C 250,120 300,70 360,60" fill="none" stroke="#09090b" strokeWidth="3.5" strokeLinecap="round" />

              {/* Bar Charts (Underneath/Supporting) */}
              <g opacity="0.3">
                <rect x="65" y="190" width="14" height="60" rx="3" fill="#09090b" style={{ transformOrigin: '0 250px', animation: 'grow-bar 1.5s ease-out' }} />
                <rect x="145" y="150" width="14" height="100" rx="3" fill="#71717a" style={{ transformOrigin: '0 250px', animation: 'grow-bar 1.7s ease-out' }} />
                <rect x="225" y="110" width="14" height="140" rx="3" fill="#09090b" style={{ transformOrigin: '0 250px', animation: 'grow-bar 1.9s ease-out' }} />
                <rect x="305" y="80" width="14" height="170" rx="3" fill="#27272a" style={{ transformOrigin: '0 250px', animation: 'grow-bar 2.1s ease-out' }} />
              </g>

              {/* Interactive/Pulsing Data Nodes */}
              {/* Node 1 */}
              <g>
                <circle cx="200" cy="130" r="6" fill="#09090b" />
                <circle cx="200" cy="130" r="16" fill="none" stroke="#09090b" strokeWidth="1.5" style={{ transformOrigin: '200px 130px', animation: 'pulse-node 2s infinite' }} />
              </g>

              {/* Node 2 (Peak) */}
              <g style={{ animation: 'float-node 3s ease-in-out infinite' }}>
                <circle cx="360" cy="60" r="8" fill="#09090b" />
                <circle cx="360" cy="60" r="4" fill="#ffffff" />
              </g>
              
              {/* Tiny Minimalist Labels */}
              <text x="40" y="272" fontFamily="var(--font-body)" fontWeight="600" fontSize="9" fill="#71717a" textAnchor="middle">Q1</text>
              <text x="120" y="272" fontFamily="var(--font-body)" fontWeight="600" fontSize="9" fill="#71717a" textAnchor="middle">Q2</text>
              <text x="200" y="272" fontFamily="var(--font-body)" fontWeight="600" fontSize="9" fill="#71717a" textAnchor="middle">Q3</text>
              <text x="280" y="272" fontFamily="var(--font-body)" fontWeight="600" fontSize="9" fill="#71717a" textAnchor="middle">Q4</text>
              <text x="360" y="272" fontFamily="var(--font-body)" fontWeight="600" fontSize="9" fill="#09090b" textAnchor="middle">Active</text>

              {/* Mini Dashboard Overlay Card (Floating - Borderless with Shadow) */}
              <g style={{ animation: 'float-card 6s ease-in-out infinite' }}>
                <rect width="130" height="60" rx="12" fill="#ffffff" style={{ filter: 'drop-shadow(0 4px 12px rgba(9, 9, 11, 0.05))' }} />
                <text x="15" y="22" fontFamily="var(--font-heading)" fontWeight="700" fontSize="9" fill="#71717a" letterSpacing="0.05em">CREDIT HEALTH</text>
                <text x="15" y="44" fontFamily="var(--font-heading)" fontWeight="800" fontSize="18" fill="#09090b">+85 pts</text>
                <circle cx="108" cy="30" r="8" fill="#fafafa" stroke="#e4e4e7" strokeWidth="1" />
                <path d="M 105,32 L 108,29 L 111,32 M 108,29 L 108,34" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Logged In Dashboard Section */}
      {loggedIn && (
        <div className="animate-fade-in" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '2rem', width: '100%' }}>

          {/* Credit Score Card */}
          {currentUser && (
            <div 
              className="glass-panel" 
              style={{
                padding: '2.5rem',
                background: 'var(--bg-secondary)',
                borderRadius: '16px',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '2rem',
                marginBottom: '3rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.01) rotateX(1deg) rotateY(1deg)'
                e.currentTarget.style.boxShadow = '0 20px 40px rgba(9, 9, 11, 0.06), 0 0 25px rgba(79, 70, 229, 0.04)'
                e.currentTarget.style.borderColor = 'rgba(79, 70, 229, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.04)'
                e.currentTarget.style.borderColor = 'var(--glass-border)'
              }}
            >
              <div style={{ flex: '1 1 300px' }}>
                <h3 style={{ fontSize: '0.85rem', color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShieldCheck size={16} /> Credit Bureau Report
                </h3>
                <h2 style={{ fontSize: '2.8rem', fontWeight: 800, margin: '0.5rem 0 0.2rem 0', fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
                  {currentUser.creditScore || 715} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>/ 900</span>
                </h2>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '20px',
                    background: (currentUser.creditScore || 715) >= 750 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(79, 70, 229, 0.08)',
                    color: (currentUser.creditScore || 715) >= 750 ? '#10b981' : '#4f46e5'
                  }}>
                    {(currentUser.creditScore || 715) >= 750 ? 'EXCELLENT PROFILE' : 'GOOD STANDING'}
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '1.2rem', lineHeight: '1.6' }}>
                  Your credit utilization is <strong style={{ color: 'var(--text-primary)' }}>{currentUser.creditUtilizationRatio ?? 75}%</strong> across <strong style={{ color: 'var(--text-primary)' }}>{currentUser.totalActiveAccounts ?? 3}</strong> active trades. Maintaining credit utilization ratio (CUR) below 30% signals low credit dependency.
                </p>
              </div>

              {/* Graphical Circular Gauge */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', width: '130px', height: '130px' }}>
                <svg width="130" height="130" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(9, 9, 11, 0.05)" strokeWidth="8" />
                  <circle cx="60" cy="60" r="50" fill="none"
                    stroke="url(#scoreGrad)"
                    strokeWidth="10"
                    strokeDasharray={`${2 * Math.PI * 50}`}
                    strokeDashoffset={`${2 * Math.PI * 50 * (1 - (currentUser.creditScore || 715) / 900)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
                  />
                  <defs>
                    <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{currentUser.creditScore || 715}</span>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credit Score</p>
                </div>
              </div>
            </div>
          )}

          <h2 style={{ marginBottom: '0.5rem' }}>Your Active <span className="gradient-text">Liabilities</span></h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>All active outstanding loans compiled from verified credit networks.</p>

          {loading && (
            <div className="loading-wrapper" style={{ padding: '2rem' }}>
              <div className="spinner" style={{ width: '40px', height: '40px', borderWidth: '3px' }}></div>
              <p>Refreshing outstanding records...</p>
            </div>
          )}

          {error && (
            <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && loans.length === 0 && (
            <div className="glass-panel text-center" style={{ padding: '3rem 2rem' }}>
              <ShieldCheck size={48} color="#10b981" style={{ marginBottom: '1.2rem', display: 'inline' }} />
              <h3>Excellent Profile Standing!</h3>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No active outstanding loans or credit lines detected under your profile.</p>
            </div>
          )}

          {!loading && !error && loans.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Grid of Loans */}
              <div className="grid-container" style={{ marginTop: 0 }}>
                {loansToShow.map((loan) => (
                  <div 
                    key={loan.id} 
                    className="glass-panel" 
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      justifyContent: 'space-between', 
                      padding: '2rem', 
                      borderLeft: '4px solid #09090b', 
                      background: 'var(--bg-secondary)',
                      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.4s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-6px) scale(1.02) rotateX(1.5deg) rotateY(-1.5deg)'
                      e.currentTarget.style.boxShadow = '0 20px 40px rgba(9, 9, 11, 0.08)'
                      e.currentTarget.style.borderColor = 'rgba(9, 9, 11, 0.25)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'none'
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(9, 9, 11, 0.05)'
                      e.currentTarget.style.borderColor = 'var(--glass-border)'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '20px', background: loan.status === 'ACTIVE' ? 'rgba(99, 102, 241, 0.08)' : 'rgba(16, 185, 129, 0.08)', color: loan.status === 'ACTIVE' ? '#6366f1' : '#10b981' }}>
                          {loan.status}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase', background: 'rgba(79, 70, 229, 0.06)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                          {loan.category || (loan.type === 'CREDIT_CARD' ? 'Credit Card' : 'Personal Loan')}
                        </span>
                      </div>

                      <h3 style={{ marginBottom: '0.2rem' }}>{loan.biller_name || loan.billerName}</h3>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        Account No: {loan.loan_account_number || loan.loanAccountNumber}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.8rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Outstanding Due</span>
                          <span style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>
                            {formatRupees(loan.total_outstanding || loan.totalOutstanding)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Simulated Projections Block */}
                    {loan.status !== 'SETTLED' && (
                      <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', marginBottom: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Simulated Score Impact</span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>If Repaid In Full:</span>
                          <strong style={{ color: getScoreDelta('PAY_NOW', loan.type).startsWith('-') ? '#ff6b6b' : '#34d399' }}>
                            {getScoreDelta('PAY_NOW', loan.type)} pts
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>If Settled Now:</span>
                          <strong style={{ color: getScoreDelta('SETTLE_NOW', loan.type).startsWith('-') ? '#ff6b6b' : '#34d399' }}>
                            {getScoreDelta('SETTLE_NOW', loan.type)} pts
                          </strong>
                        </div>
                      </div>
                    )}

                    {/* Actions Row */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', cursor: 'pointer' }}
                        onClick={() => handlePayNow(loan)}
                        disabled={loan.status === 'SETTLED'}
                      >
                        Pay Now <ArrowRight size={16} />
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.6rem 1rem', fontSize: '0.9rem', cursor: 'pointer' }}
                        onClick={() => navigate('/settlement', { state: { preSelectedLoanId: loan.id, preSelectedLoan: loan } })}
                        disabled={loan.status === 'SETTLED'}
                      >
                        Settle Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Show More/Less Toggle */}
              {loans.length > 2 && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.6rem 1.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => setShowAllLoans(!showAllLoans)}
                  >
                    {showAllLoans ? (
                      <>
                        Show Less <ChevronUp size={18} />
                      </>
                    ) : (
                      <>
                        Show More ({loans.length - 2} more) <ChevronDown size={18} />
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Bottom Quick Action Hub */}
              <div style={{ borderTop: '1px solid var(--glass-border)', marginTop: '3rem', paddingTop: '2.5rem', width: '100%' }}>
                <h3 style={{ marginBottom: '1.2rem', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Quick Action <span className="gradient-text">Hub</span></h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', width: '100%' }}>

                  {/* Action 1: Setup AutoPay (UPI Mandate) */}
                  <div className="glass-panel" style={{
                    padding: '1.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                    onClick={() => navigate('/autopay')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'var(--glass-border)'
                    }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1rem' }}>
                        <Calendar size={18} color="#4f46e5" />
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Setup UPI Mandate</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Automate recurring monthly repayments to guarantee timely EMIs and secure your history.</p>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.2rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      Go to AutoPay <ArrowRight size={14} />
                    </button>
                  </div>

                  {/* Action 2: Direct Repayment */}
                  <div className="glass-panel" style={{
                    padding: '1.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'var(--glass-border)'
                    }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1rem' }}>
                        <CreditCard size={18} color="#4f46e5" />
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Direct Repayment</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Query live BBPS billers, fetch outstanding transactions, and clear debts manually.</p>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.2rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      Pay Instantly <ArrowRight size={14} />
                    </button>
                  </div>

                  {/* Action 3: Settlement Center */}
                  <div className="glass-panel" style={{
                    padding: '1.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                    onClick={() => navigate('/settlement')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'var(--glass-border)'
                    }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1rem' }}>
                        <ShieldCheck size={18} color="#4f46e5" />
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Settlement Center</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Resolve delayed credit files, claim discounts, and close accounts with No Due Certificates.</p>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.2rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      Settle Account <ArrowRight size={14} />
                    </button>
                  </div>

                  {/* Action 4: Account Statement */}
                  <div className="glass-panel" style={{
                    padding: '1.8rem',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '180px',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                    onClick={() => navigate('/statement')}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)'
                      e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.borderColor = 'var(--glass-border)'
                    }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1rem' }}>
                        <FileText size={18} color="#4f46e5" />
                      </div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Account Statement</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Access and download aggregate histories, invoices, and No Due Certificates.</p>
                    </div>
                    <button className="btn btn-secondary" style={{ width: '100%', marginTop: '1.2rem', padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                      View Statements <ArrowRight size={14} />
                    </button>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
