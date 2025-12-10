// Report configuration for branded exports

export const reportConfig = {
  companyName: "SecureGuard Pro",
  tagline: "Enterprise Security Scanner",
  colors: {
    primary: "#6366f1",
    primaryLight: "#818cf8",
    success: "#22c55e",
    warning: "#f59e0b",
    danger: "#ef4444",
    critical: "#dc2626",
    high: "#ea580c",
    medium: "#ca8a04",
    low: "#0ea5e9",
    dark: "#0f172a",
    muted: "#64748b",
    border: "#334155",
    background: "#1e293b",
  },
  footer: {
    confidentiality: "CONFIDENTIAL - For authorized personnel only",
    copyright: `© ${new Date().getFullYear()} SecureGuard Pro. All rights reserved.`,
  },
};

export const getShieldLogoSVG = (color: string = "#6366f1") => `
  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
`;

export const generatePDFTemplate = (
  content: string,
  reportTitle: string,
  metadata: {
    generatedAt: string;
    filterSummary: string;
    recordCount: number;
  },
  stats: {
    totalScans: number;
    successRate: number;
    totalVulns: number;
    avgDuration: string;
  }
) => {
  const { companyName, tagline, colors, footer } = reportConfig;
  const logoSVG = getShieldLogoSVG(colors.primary);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${reportTitle} - ${companyName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #ffffff;
            color: #1e293b;
            line-height: 1.5;
          }
          
          .page {
            padding: 40px;
            max-width: 1100px;
            margin: 0 auto;
          }
          
          /* Header */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 24px;
            border-bottom: 3px solid ${colors.primary};
            margin-bottom: 32px;
          }
          
          .brand {
            display: flex;
            align-items: center;
            gap: 16px;
          }
          
          .brand-logo {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, ${colors.primary}, ${colors.primaryLight});
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
          }
          
          .brand-logo svg {
            stroke: white;
          }
          
          .brand-text h1 {
            font-size: 24px;
            font-weight: 700;
            color: ${colors.dark};
            letter-spacing: -0.5px;
          }
          
          .brand-text p {
            font-size: 12px;
            color: ${colors.muted};
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          
          .report-info {
            text-align: right;
          }
          
          .report-title {
            font-size: 20px;
            font-weight: 600;
            color: ${colors.dark};
            margin-bottom: 4px;
          }
          
          .report-date {
            font-size: 13px;
            color: ${colors.muted};
          }
          
          /* Metadata Bar */
          .metadata-bar {
            background: linear-gradient(135deg, ${colors.background}, #1e293b);
            border-radius: 12px;
            padding: 20px 24px;
            margin-bottom: 28px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: white;
          }
          
          .metadata-item {
            display: flex;
            flex-direction: column;
          }
          
          .metadata-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: rgba(255,255,255,0.6);
            margin-bottom: 4px;
          }
          
          .metadata-value {
            font-size: 14px;
            font-weight: 500;
          }
          
          /* Stats Grid */
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 32px;
          }
          
          .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
          }
          
          .stat-value {
            font-size: 32px;
            font-weight: 700;
            color: ${colors.dark};
            margin-bottom: 4px;
          }
          
          .stat-label {
            font-size: 12px;
            color: ${colors.muted};
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .stat-card.success .stat-value { color: ${colors.success}; }
          .stat-card.warning .stat-value { color: ${colors.warning}; }
          .stat-card.primary .stat-value { color: ${colors.primary}; }
          
          /* Table */
          .table-container {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 32px;
          }
          
          .table-header {
            background: ${colors.dark};
            color: white;
            padding: 16px 20px;
            font-size: 16px;
            font-weight: 600;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
          }
          
          th {
            background: #f1f5f9;
            padding: 14px 16px;
            text-align: left;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: ${colors.muted};
            border-bottom: 1px solid #e2e8f0;
          }
          
          td {
            padding: 14px 16px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
            color: ${colors.dark};
          }
          
          tr:hover {
            background: #fafafa;
          }
          
          tr:last-child td {
            border-bottom: none;
          }
          
          /* Badges */
          .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          
          .badge-completed {
            background: #dcfce7;
            color: #166534;
          }
          
          .badge-failed {
            background: #fee2e2;
            color: #991b1b;
          }
          
          .badge-in_progress {
            background: #fef3c7;
            color: #92400e;
          }
          
          .vuln-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-right: 4px;
          }
          
          .vuln-critical {
            background: #fee2e2;
            color: ${colors.critical};
          }
          
          .vuln-high {
            background: #ffedd5;
            color: ${colors.high};
          }
          
          .vuln-medium {
            background: #fef3c7;
            color: ${colors.medium};
          }
          
          .vuln-low {
            background: #e0f2fe;
            color: ${colors.low};
          }
          
          .vuln-total {
            font-weight: 600;
            color: ${colors.dark};
          }
          
          /* Footer */
          .footer {
            margin-top: 40px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .footer-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .footer-logo {
            width: 24px;
            height: 24px;
          }
          
          .footer-brand {
            font-size: 13px;
            font-weight: 600;
            color: ${colors.dark};
          }
          
          .footer-confidential {
            font-size: 11px;
            color: ${colors.muted};
            font-style: italic;
          }
          
          .footer-right {
            text-align: right;
          }
          
          .footer-copyright {
            font-size: 11px;
            color: ${colors.muted};
          }
          
          .footer-page {
            font-size: 12px;
            color: ${colors.dark};
            font-weight: 500;
            margin-top: 4px;
          }
          
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <!-- Header -->
          <header class="header">
            <div class="brand">
              <div class="brand-logo">
                ${logoSVG}
              </div>
              <div class="brand-text">
                <h1>${companyName}</h1>
                <p>${tagline}</p>
              </div>
            </div>
            <div class="report-info">
              <div class="report-title">${reportTitle}</div>
              <div class="report-date">${metadata.generatedAt}</div>
            </div>
          </header>
          
          <!-- Metadata Bar -->
          <div class="metadata-bar">
            <div class="metadata-item">
              <span class="metadata-label">Generated</span>
              <span class="metadata-value">${metadata.generatedAt}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Filters Applied</span>
              <span class="metadata-value">${metadata.filterSummary}</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Records</span>
              <span class="metadata-value">${metadata.recordCount} scans</span>
            </div>
          </div>
          
          <!-- Stats Grid -->
          <div class="stats-grid">
            <div class="stat-card primary">
              <div class="stat-value">${stats.totalScans}</div>
              <div class="stat-label">Total Scans</div>
            </div>
            <div class="stat-card success">
              <div class="stat-value">${stats.successRate}%</div>
              <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat-card warning">
              <div class="stat-value">${stats.totalVulns}</div>
              <div class="stat-label">Vulnerabilities</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.avgDuration}</div>
              <div class="stat-label">Avg. Duration</div>
            </div>
          </div>
          
          <!-- Table -->
          <div class="table-container">
            <div class="table-header">Scan Results</div>
            ${content}
          </div>
          
          <!-- Footer -->
          <footer class="footer">
            <div class="footer-left">
              <div class="footer-logo">${getShieldLogoSVG(colors.primary)}</div>
              <div>
                <div class="footer-brand">${companyName}</div>
                <div class="footer-confidential">${footer.confidentiality}</div>
              </div>
            </div>
            <div class="footer-right">
              <div class="footer-copyright">${footer.copyright}</div>
              <div class="footer-page">Page 1 of 1</div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  `;
};

export const generateCSVWithHeader = (
  headers: string[],
  rows: string[][],
  metadata: {
    reportTitle: string;
    generatedAt: string;
    filterSummary: string;
    recordCount: number;
  },
  stats: {
    totalScans: number;
    successRate: number;
    totalVulns: number;
    avgDuration: string;
  }
): string => {
  const { companyName } = reportConfig;
  
  const headerRows = [
    [`${companyName} - ${metadata.reportTitle}`],
    [`Generated: ${metadata.generatedAt}`],
    [`Filters: ${metadata.filterSummary}`],
    [`Total Records: ${metadata.recordCount}`],
    [],
    ["SUMMARY"],
    [`Total Scans,${stats.totalScans}`],
    [`Success Rate,${stats.successRate}%`],
    [`Total Vulnerabilities,${stats.totalVulns}`],
    [`Average Duration,${stats.avgDuration}`],
    [],
    ["DETAILED RESULTS"],
  ];
  
  const allRows = [
    ...headerRows,
    headers,
    ...rows,
  ];
  
  return allRows.map(row => row.join(",")).join("\n");
};
