import '../styles/index.css'
import { RouterStateProvider } from '../utils/router'
import HeaderAndFooterWrapper from '../components/HeaderAndFooterWrapper'
import Script from 'next/script'

export const metadata = {
  title: 'ArisX - Premium Loan Payment Portal',
  description: 'Bharat Bill Payment System (BBPS) Loan EMI Payments and Mandate Settlements Portal powered by Setu.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/vite.svg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body>
        <RouterStateProvider>
          <HeaderAndFooterWrapper>
            {children}
          </HeaderAndFooterWrapper>
        </RouterStateProvider>
        <Script 
          src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js" 
          strategy="lazyOnload" 
        />
      </body>
    </html>
  )
}
