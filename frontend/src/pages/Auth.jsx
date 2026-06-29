import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, UserCheck, Shield, FileText, ArrowRight, Info, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { setToken, setUser } from '../utils/auth'

export default function Auth() {
  const navigate = useNavigate()
  
  // Tab State
  const [activeTab, setActiveTab] = useState('login') // 'login' or 'register'

  // Input States
  const [mobile, setMobile] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [pan, setPan] = useState('')
  const [tcAccepted, setTcAccepted] = useState(false)

  // Flow States
  const [otpSent, setOtpSent] = useState(false)
  const [otpHint, setOtpHint] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetFlow = () => {
    setOtpSent(false)
    setOtpHint('')
    setError('')
    setSuccess('')
    setOtpCode('')
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    resetFlow()
  }

  // Request OTP for Sign In or Sign Up
  const handleRequestOTP = (e) => {
    e.preventDefault()
    if (!mobile || mobile.length !== 10 || !/^\d+$/.test(mobile)) {
      setError('Please enter a valid 10-digit mobile number.')
      return
    }
    
    setError('')
    setLoading(true)

    fetch(`/api/auth/send-otp?purpose=${activeTab}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mobile })
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to send OTP verification code.')
        }
        return data
      })
      .then((data) => {
        setOtpSent(true)
        setOtpHint(data.otp_hint)
        setSuccess('Mock OTP sent successfully! Use code shown in the hint below.')
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  // Submit Registration
  const handleRegister = (e) => {
    e.preventDefault()
    if (!firstName || !lastName || !dob || !mobile || !pan || !otpCode) {
      setError('Please fill in all registration fields.')
      return
    }
    if (!tcAccepted) {
      setError('You must accept the Terms and Conditions to proceed.')
      return
    }
    // Verify PAN structure (5 letters, 4 digits, 1 letter)
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i
    if (!panRegex.test(pan)) {
      setError('Please enter a valid 10-digit PAN (e.g. ABCDE1234F).')
      return
    }

    setError('')
    setLoading(true)

    const payload = {
      first_name: firstName,
      last_name: lastName,
      dob: dob,
      mobile: mobile,
      pan: pan.toUpperCase(),
      otp_code: otpCode,
      tc_accepted: tcAccepted
    }

    fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Registration failed.')
        }
        return data
      })
      .then((data) => {
        setToken(data.access_token)
        setUser(data.user)
        setLoading(false)
        // Refresh page or route to home
        window.location.href = '/'
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  // Submit Login
  const handleLogin = (e) => {
    e.preventDefault()
    if (!mobile || !otpCode) {
      setError('Please provide both mobile number and OTP.')
      return
    }

    setError('')
    setLoading(true)

    fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ mobile, otp_code: otpCode })
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || 'Login failed.')
        }
        return data
      })
      .then((data) => {
        setToken(data.access_token)
        setUser(data.user)
        setLoading(false)
        // Refresh page or route to home
        window.location.href = '/'
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }

  return (
    <div className="identify-container" style={{ margin: '40px auto', maxWidth: '520px' }}>
      
      {/* Title block */}
      <div className="text-center" style={{ marginBottom: '2.5rem' }}>
        <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', padding: '1rem', borderRadius: '50%', display: 'inline-flex', marginBottom: '1.2rem' }}>
          <Lock size={32} />
        </div>
        <h2>Portal Access Security</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Sign in or register to securely access your active loan profiles, settlement tools, and AutoPay mandate settings.
        </p>
      </div>

      {/* Glassmorphic card */}
      <div className="glass-panel" style={{ padding: '2.5rem' }}>
        
        {/* Tab Menu */}
        <div className="tab-menu" style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem', background: 'rgba(9, 9, 11, 0.02)', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <button 
            type="button"
            className="btn" 
            style={{ flex: 1, padding: '0.7rem', fontSize: '0.95rem', border: 'none', background: activeTab === 'login' ? 'var(--primary-gradient)' : 'transparent', color: activeTab === 'login' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
            onClick={() => handleTabChange('login')}
          >
            Sign In
          </button>
          <button 
            type="button"
            className="btn" 
            style={{ flex: 1, padding: '0.7rem', fontSize: '0.95rem', border: 'none', background: activeTab === 'register' ? 'var(--primary-gradient)' : 'transparent', color: activeTab === 'register' ? '#fff' : 'var(--text-muted)', cursor: 'pointer' }}
            onClick={() => handleTabChange('register')}
          >
            Sign Up
          </button>
        </div>

        {/* Error and Success Banners */}
        {error && (
          <div style={{ padding: '0.8rem 1rem', background: 'rgba(239, 68, 68, 0.08)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ padding: '0.8rem 1rem', background: 'rgba(16, 185, 129, 0.08)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <UserCheck size={16} />
            <span>{success}</span>
          </div>
        )}

        {/* Mock OTP display banner */}
        {otpSent && otpHint && (
          <div style={{ background: 'rgba(99, 102, 241, 0.08)', color: '#6366f1', border: '1px dashed rgba(99, 102, 241, 0.3)', borderRadius: '10px', padding: '0.8rem 1rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            <Info size={18} />
            <span>
              Simulated verification code sent: <strong>{otpHint}</strong>
            </span>
          </div>
        )}

        {/* TAB CONTENT: SIGN IN */}
        {activeTab === 'login' && (
          <form onSubmit={otpSent ? handleLogin : handleRequestOTP}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-mobile">Registered Mobile Number</label>
              <input 
                id="login-mobile"
                type="tel" 
                className="form-input" 
                placeholder="e.g. 9876543210" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').substring(0, 10))}
                maxLength={10}
                required
                disabled={otpSent || loading}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                💡 Seeded mobile numbers to test: <strong>9876543210</strong> or <strong>9999988888</strong>.
              </span>
            </div>

            {otpSent && (
              <div className="form-group animate-fade-in">
                <label className="form-label" htmlFor="login-otp">Verification OTP</label>
                <input 
                  id="login-otp"
                  type="password" 
                  className="form-input text-center" 
                  placeholder="Enter 6-digit code" 
                  value={otpCode} 
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  maxLength={6}
                  style={{ letterSpacing: '0.2em', fontWeight: 'bold', fontSize: '1.2rem' }}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {!otpSent ? (
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem', cursor: 'pointer' }}
                disabled={loading}
              >
                {loading ? 'Requesting OTP...' : 'Get Verification Code'} <ArrowRight size={18} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, cursor: 'pointer' }} 
                  onClick={resetFlow}
                  disabled={loading}
                >
                  Change Mobile
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, cursor: 'pointer' }}
                  disabled={loading}
                >
                  {loading ? 'Signing In...' : 'Verify & Sign In'}
                </button>
              </div>
            )}
          </form>
        )}

        {/* TAB CONTENT: SIGN UP */}
        {activeTab === 'register' && (
          <form onSubmit={otpSent ? handleRegister : handleRequestOTP}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-first-name">First Name</label>
                <input 
                  id="reg-first-name"
                  type="text" 
                  className="form-input" 
                  placeholder="Rahul" 
                  value={firstName} 
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  disabled={otpSent || loading}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-last-name">Last Name</label>
                <input 
                  id="reg-last-name"
                  type="text" 
                  className="form-input" 
                  placeholder="Kumar" 
                  value={lastName} 
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  disabled={otpSent || loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-dob">Date of Birth</label>
              <input 
                id="reg-dob"
                type="date" 
                className="form-input" 
                value={dob} 
                onChange={(e) => setDob(e.target.value)}
                required
                disabled={otpSent || loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-pan">PAN (Permanent Account Number)</label>
              <input 
                id="reg-pan"
                type="text" 
                className="form-input" 
                placeholder="ABCDE1234F" 
                value={pan} 
                onChange={(e) => setPan(e.target.value)}
                maxLength={10}
                required
                style={{ textTransform: 'uppercase' }}
                disabled={otpSent || loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="reg-mobile">Mobile Number</label>
              <input 
                id="reg-mobile"
                type="tel" 
                className="form-input" 
                placeholder="e.g. 9876123450" 
                value={mobile} 
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').substring(0, 10))}
                maxLength={10}
                required
                disabled={otpSent || loading}
              />
            </div>

            {/* Scrollable Terms & Conditions box */}
            <div style={{ marginBottom: '1.2rem' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.4rem' }}>Compliance & T&C Acceptance</label>
              <div style={{ height: '90px', overflowY: 'scroll', border: '1px solid var(--glass-border)', padding: '0.6rem', borderRadius: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(9, 9, 11, 0.01)', lineHeight: '1.4' }}>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 'bold', margin: '0 0 0.3rem 0', color: 'var(--text-primary)' }}>Terms of Service</h4>
                <p style={{ margin: '0 0 0.4rem 0' }}>1. By checking the box below, you consent to link your financial files via Setu's Account Aggregator and consent to sharing loan account metadata with FinRecovery Solutions.</p>
                <p style={{ margin: '0 0 0.4rem 0' }}>2. Data usage: We fetch outstanding bills and mandates from NPCI networks securely. No credentials or credentials tokens are persistently stored locally.</p>
                <p style={{ margin: '0 0 0.4rem 0' }}>3. AutoPay Mandates: Setting up AutoPay authorizes merchant auto-debits under NPCI BBPS rules. You will be notified 24 hours prior to debit.</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input 
                id="tc-check"
                type="checkbox" 
                checked={tcAccepted} 
                onChange={(e) => setTcAccepted(e.target.checked)} 
                required
                disabled={otpSent || loading}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#09090b' }}
              />
              <label htmlFor="tc-check" style={{ fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)' }}>
                I agree to the Terms of Service & authorize account linkages
              </label>
            </div>

            {otpSent && (
              <div className="form-group animate-fade-in">
                <label className="form-label" htmlFor="reg-otp">Verification OTP</label>
                <input 
                  id="reg-otp"
                  type="password" 
                  className="form-input text-center" 
                  placeholder="Enter 6-digit code" 
                  value={otpCode} 
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  maxLength={6}
                  style={{ letterSpacing: '0.2em', fontWeight: 'bold', fontSize: '1.2rem' }}
                  required
                  disabled={loading}
                />
              </div>
            )}

            {!otpSent ? (
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', cursor: 'pointer' }}
                disabled={loading}
              >
                {loading ? 'Requesting OTP...' : 'Get Verification Code'} <ArrowRight size={18} />
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ flex: 1, cursor: 'pointer' }} 
                  onClick={resetFlow}
                  disabled={loading}
                >
                  Change Details
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ flex: 1, cursor: 'pointer' }}
                  disabled={loading}
                >
                  {loading ? 'Registering...' : 'Verify & Register'}
                </button>
              </div>
            )}
          </form>
        )}

      </div>
    </div>
  )
}
