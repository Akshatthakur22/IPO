import React from "react";
import { Inter } from "next/font/google";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { Toaster } from "react-hot-toast";
import ErrorBoundary from "./components/ErrorBoundary";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "IPO Tracker - Live IPO Tracking & Analytics",
  description:
    "Track live IPO GMP, subscription data, allotment status, and market analytics. Get real-time updates on Indian stock market IPOs.",
  keywords:
    "IPO, GMP, Grey Market Premium, Subscription, Allotment, Stock Market, India, NSE, BSE",
  authors: [{ name: "IPO Tracker Team" }],
  viewport: "width=device-width, initial-scale=1",
  themeColor: "#3B82F6",
  openGraph: {
    title: "IPO Tracker - Live IPO Tracking & Analytics",
    description:
      "Real-time IPO data, GMP tracking, and market analytics platform",
    type: "website",
    url: "https://ipo-tracker.com",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "IPO Tracker Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IPO Tracker - Live IPO Data",
    description:
      "Track IPO GMP, subscription, and allotment status in real-time",
    images: ["/twitter-image.jpg"],
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon-16x16.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* Additional meta tags */}
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow" />
        <meta name="format-detection" content="telephone=no" />

        {/* PWA meta tags */}
        <meta name="application-name" content="IPO Tracker" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="IPO Tracker" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#3B82F6" />
        <meta name="msapplication-config" content="/browserconfig.xml" />

        {/* Analytics & Tracking */}
        {process.env.NODE_ENV === "production" && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}');
                `,
              }}
            />
          </>
        )}
      </head>

      <body className={`${inter.className} antialiased`}>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <NotificationProvider>
                <div id="root">
                  {/* Background Pattern */}
                  <div className="fixed inset-0 -z-10 bg-gray-50">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f9ff_1px,transparent_1px),linear-gradient(to_bottom,#f0f9ff_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
                  </div>

                  {/* Skip to content link for accessibility */}
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-lg z-50"
                  >
                    Skip to main content
                  </a>

                  {/* Main App */}
                  <main id="main-content">{children}</main>

                  {/* Toast Notifications */}
                  <Toaster
                    position="top-right"
                    toastOptions={{
                      duration: 4000,
                      style: {
                        background: "#fff",
                        color: "#374151",
                        border: "1px solid #e5e7eb",
                        borderRadius: "0.5rem",
                        fontSize: "14px",
                      },
                      success: {
                        iconTheme: {
                          primary: "#10b981",
                          secondary: "#fff",
                        },
                      },
                      error: {
                        iconTheme: {
                          primary: "#ef4444",
                          secondary: "#fff",
                        },
                      },
                    }}
                  />

                  {/* Global Loading Indicator */}
                  <div id="global-loading" className="hidden">
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                      <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                        <span className="text-gray-700">Loading...</span>
                      </div>
                    </div>
                  </div>

                  {/* Service Worker Registration */}
                  {process.env.NODE_ENV === "production" && (
                    <script
                      dangerouslySetInnerHTML={{
                        __html: `
                          if ('serviceWorker' in navigator) {
                            window.addEventListener('load', function() {
                              navigator.serviceWorker.register('/sw.js')
                                .then(function(registration) {
                                  console.log('SW registered: ', registration);
                                })
                                .catch(function(registrationError) {
                                  console.log('SW registration failed: ', registrationError);
                                });
                            });
                          }
                        `,
                      }}
                    />
                  )}

                  {/* Global Error Handler */}
                  <script
                    dangerouslySetInnerHTML={{
                      __html: `
                        window.addEventListener('error', function(e) {
                          console.error('Global error:', e.error);
                          // Could send to error tracking service
                        });
                        
                        window.addEventListener('unhandledrejection', function(e) {
                          console.error('Unhandled promise rejection:', e.reason);
                          // Could send to error tracking service
                        });
                      `,
                    }}
                  />

                  {/* WebSocket Connection Manager */}
                  <script
                    dangerouslySetInnerHTML={{
                      __html: `
                        window.wsConnection = null;
                        window.connectWebSocket = function() {
                          if (window.wsConnection?.readyState === WebSocket.OPEN) return;
                          
                          const wsUrl = location.protocol === 'https:' ? 'wss:' : 'ws:';
                          window.wsConnection = new WebSocket(wsUrl + '//' + location.host + '/ws');
                          
                          window.wsConnection.onopen = function() {
                            console.log('WebSocket connected');
                          };
                          
                          window.wsConnection.onclose = function() {
                            console.log('WebSocket disconnected, reconnecting...');
                            setTimeout(window.connectWebSocket, 5000);
                          };
                          
                          window.wsConnection.onerror = function(error) {
                            console.error('WebSocket error:', error);
                          };
                        };
                        
                        // Auto-connect if on dashboard pages
                        if (location.pathname.startsWith('/dashboard')) {
                          window.connectWebSocket();
                        }
                      `,
                    }}
                  />
                </div>
              </NotificationProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>

        {/* Development Tools */}
        {process.env.NODE_ENV === "development" && (
          <div className="fixed bottom-4 right-4 z-50">
            <div className="bg-gray-900 text-white px-3 py-1 rounded text-xs font-mono">
              DEV MODE
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.addEventListener('keydown', function(e) {
                // Ctrl/Cmd + K for search
                if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                  e.preventDefault();
                  document.querySelector('input[type="search"], input[placeholder*="search" i]')?.focus();
                }
                
                // Ctrl/Cmd + / for help
                if ((e.ctrlKey || e.metaKey) && e.key === '/') {
                  e.preventDefault();
                  // Show help modal or navigate to help
                }
                
                // Escape to close modals
                if (e.key === 'Escape') {
                  document.querySelectorAll('[data-modal-close]').forEach(el => el.click());
                }
              });
            `,
          }}
        />

        {/* Performance Monitoring */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('performance' in window) {
                window.addEventListener('load', function() {
                  setTimeout(function() {
                    const perfData = performance.getEntriesByType('navigation')[0];
                    if (perfData) {
                      console.log('Page Load Time:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
                      // Could send to analytics
                    }
                  }, 0);
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}

// Global error handler for async errors
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    console.error("Global error caught:", event.error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
  });
}
