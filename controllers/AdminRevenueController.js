const AdminRevenue = require('../models/AdminRevenue');

const safeMonthKey = (value) => {
  const raw = String(value || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const buildCsv = (rows) => {
  const header = [
    'booking_id',
    'session_date',
    'session_time',
    'listing_title',
    'sport',
    'coach_name',
    'student_name',
    'gross_amount',
    'admin_amount',
    'coach_amount'
  ];
  const escape = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = rows.map((row) => header.map((key) => escape(row[key])).join(','));
  return [header.join(','), ...lines].join('\n');
};

module.exports = {
  showDashboard(req, res) {
    const monthKey = safeMonthKey(req.query && req.query.month);
    AdminRevenue.getTotals((err, totals) => {
      if (err) {
        console.error('Failed to load admin revenue totals', err);
        totals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
      }
      return AdminRevenue.getMonthlyTotals(monthKey, (monthErr, monthTotals) => {
        if (monthErr) {
          console.error('Failed to load monthly totals', monthErr);
          monthTotals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
        }
        return AdminRevenue.getMonthlyReport(monthKey, (repErr, rows) => {
          if (repErr) {
            console.error('Failed to load monthly report', repErr);
            rows = [];
          }
          return AdminRevenue.getRecentMonthlyRevenueSeries(monthKey, (seriesErr, seriesRows) => {
            if (seriesErr) {
              console.error('Failed to load revenue series', seriesErr);
              seriesRows = [];
            }
            return AdminRevenue.getRevenueBySport(monthKey, (sportErr, sportRows) => {
              if (sportErr) {
                console.error('Failed to load revenue by sport', sportErr);
                sportRows = [];
              }
              return AdminRevenue.getRevenueByCoach(monthKey, (coachErr, coachRows) => {
                if (coachErr) {
                  console.error('Failed to load revenue by coach', coachErr);
                  coachRows = [];
                }
                const monthLabels = (seriesRows || []).map((row) => row.period);
                const monthGross = (seriesRows || []).map((row) => Number(row.gross_amount || 0));
                const sportLabels = (sportRows || []).map((row) => row.sport_label);
                const sportGross = (sportRows || []).map((row) => Number(row.gross_amount || 0));
                const coachLabels = (coachRows || []).map((row) => row.coach_label);
                const coachGross = (coachRows || []).map((row) => Number(row.gross_amount || 0));

                return res.render('adminRevenue', {
                  user: req.session.user,
                  totals,
                  monthTotals,
                  reportMonth: monthKey,
                  reportRows: rows || [],
                  charts: {
                    monthLabels,
                    monthGross,
                    sportLabels,
                    sportGross,
                    coachLabels,
                    coachGross
                  },
                  messages: res.locals.messages,
                  active: 'revenue'
                });
              });
            });
          });
        });
      });
    });
  },

  downloadMonthlyReport(req, res) {
    const monthKey = safeMonthKey(req.query && req.query.month);
    AdminRevenue.getMonthlyReport(monthKey, (err, rows) => {
      if (err) {
        req.flash('error', 'Unable to generate report.');
        return res.redirect(`/adminRevenue?month=${encodeURIComponent(monthKey)}`);
      }
      return AdminRevenue.getTotals((totalsErr, totals) => {
        if (totalsErr) {
          console.error('Failed to load admin revenue totals', totalsErr);
          totals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
        }
        return AdminRevenue.getMonthlyTotals(monthKey, (monthErr, monthTotals) => {
          if (monthErr) {
            console.error('Failed to load monthly totals', monthErr);
            monthTotals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
          }
          return AdminRevenue.getRevenueBySport(monthKey, (sportErr, sportRows) => {
            if (sportErr) {
              console.error('Failed to load revenue by sport', sportErr);
              sportRows = [];
            }
            return AdminRevenue.getRevenueByCoach(monthKey, (coachErr, coachRows) => {
              if (coachErr) {
                console.error('Failed to load revenue by coach', coachErr);
                coachRows = [];
              }
              const lines = [];
              lines.push(`Report Month,${monthKey}`);
              lines.push('');
              lines.push('All-Time Totals');
              lines.push(`Gross,${Number(totals.grossRevenue || 0).toFixed(2)}`);
              lines.push(`Platform Fee (10%),${Number(totals.adminRevenue || 0).toFixed(2)}`);
              lines.push(`Coach Earnings (90%),${Number(totals.coachRevenue || 0).toFixed(2)}`);
              lines.push('');
              lines.push(`Month ${monthKey} Totals`);
              lines.push(`Gross,${Number(monthTotals.grossRevenue || 0).toFixed(2)}`);
              lines.push(`Platform Fee (10%),${Number(monthTotals.adminRevenue || 0).toFixed(2)}`);
              lines.push(`Coach Earnings (90%),${Number(monthTotals.coachRevenue || 0).toFixed(2)}`);
              lines.push('');
              lines.push('Revenue by Sport');
              lines.push('sport,gross_amount');
              (sportRows || []).forEach((row) => {
                lines.push(`${row.sport_label || 'Unknown'},${Number(row.gross_amount || 0).toFixed(2)}`);
              });
              lines.push('');
              lines.push('Revenue by Coach');
              lines.push('coach,gross_amount');
              (coachRows || []).forEach((row) => {
                lines.push(`${row.coach_label || 'Unknown'},${Number(row.gross_amount || 0).toFixed(2)}`);
              });
              lines.push('');
              lines.push('Monthly Sales Report');
              lines.push(buildCsv(rows || []));

              const csv = lines.join('\n');
              res.setHeader('Content-Type', 'text/csv');
              res.setHeader('Content-Disposition', `attachment; filename="sales-report-${monthKey}.csv"`);
              return res.send(csv);
            });
          });
        });
      });
    });
  },

  downloadMonthlyReportPdf(req, res) {
    const monthKey = safeMonthKey(req.query && req.query.month);
    AdminRevenue.getMonthlyReport(monthKey, (err, rows) => {
      if (err) {
        req.flash('error', 'Unable to generate report.');
        return res.redirect(`/adminRevenue?month=${encodeURIComponent(monthKey)}`);
      }
      const PDFDocument = require('pdfkit');
      const axios = require('axios');

      const loadCharts = () =>
        new Promise((resolve) => {
          AdminRevenue.getRecentMonthlyRevenueSeries(monthKey, (seriesErr, seriesRows) => {
            if (seriesErr) {
              console.error('Failed to load revenue series for PDF', seriesErr);
              seriesRows = [];
            }
            AdminRevenue.getRevenueBySport(monthKey, (sportErr, sportRows) => {
              if (sportErr) {
                console.error('Failed to load sport series for PDF', sportErr);
                sportRows = [];
              }
              const labels = (seriesRows || []).map((row) => row.period);
              const gross = (seriesRows || []).map((row) => Number(row.gross_amount || 0));
              const sportLabels = (sportRows || []).map((row) => row.sport_label);
              const sportGross = (sportRows || []).map((row) => Number(row.gross_amount || 0));
              return resolve({ labels, gross, sportLabels, sportGross });
            });
          });
        });
      const loadCoachBreakdown = () =>
        new Promise((resolve) => {
          AdminRevenue.getRevenueByCoach(monthKey, (coachErr, coachRows) => {
            if (coachErr) {
              console.error('Failed to load coach series for PDF', coachErr);
              coachRows = [];
            }
            return resolve(coachRows || []);
          });
        });
      const loadTotals = () =>
        new Promise((resolve) => {
          AdminRevenue.getTotals((totalsErr, totals) => {
            if (totalsErr) {
              console.error('Failed to load totals for PDF', totalsErr);
              totals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
            }
            AdminRevenue.getMonthlyTotals(monthKey, (monthErr, monthTotals) => {
              if (monthErr) {
                console.error('Failed to load monthly totals for PDF', monthErr);
                monthTotals = { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
              }
              resolve({ totals, monthTotals });
            });
          });
        });

      const renderCharts = async () => {
        const chartData = await loadCharts();
        const timeConfig = {
          type: 'line',
          data: {
            labels: chartData.labels,
            datasets: [
              { label: 'Gross', data: chartData.gross, borderColor: '#0f172a', tension: 0.3, fill: false }
            ]
          },
          options: {
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { ticks: { callback: (value) => '$' + value } } }
          }
        };
        const sportConfig = {
          type: 'pie',
          data: {
            labels: chartData.sportLabels,
            datasets: [
              {
                label: 'Gross',
                data: chartData.sportGross,
                backgroundColor: ['#2563eb', '#f97316', '#16a34a', '#dc2626', '#0f172a', '#14b8a6', '#eab308', '#9333ea', '#3b82f6', '#6b7280']
              }
            ]
          },
          options: {
            plugins: { legend: { position: 'bottom' } }
          }
        };
        const coachConfig = {
          type: 'bar',
          data: {
            labels: chartData.coachLabels,
            datasets: [{ label: 'Gross', data: chartData.coachGross, backgroundColor: '#0f172a' }]
          },
          options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: (value) => '$' + value } } }
          }
        };
        const timeUrl = `https://quickchart.io/chart?width=720&height=320&format=png&c=${encodeURIComponent(JSON.stringify(timeConfig))}`;
        const sportUrl = `https://quickchart.io/chart?width=720&height=320&format=png&c=${encodeURIComponent(JSON.stringify(sportConfig))}`;
        const coachUrl = `https://quickchart.io/chart?width=720&height=320&format=png&c=${encodeURIComponent(JSON.stringify(coachConfig))}`;
        const [timeRes, sportRes, coachRes] = await Promise.all([
          axios.get(timeUrl, { responseType: 'arraybuffer' }),
          axios.get(sportUrl, { responseType: 'arraybuffer' }),
          axios.get(coachUrl, { responseType: 'arraybuffer' })
        ]);
        return {
          timeSeries: Buffer.from(timeRes.data),
          bySport: Buffer.from(sportRes.data),
          byCoach: Buffer.from(coachRes.data)
        };
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${monthKey}.pdf"`);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.pipe(res);

      doc.fontSize(18).text(`Sales Report - ${monthKey}`, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(`Generated: ${new Date().toLocaleString('en-SG')}`);
      doc.moveDown();

      const chartWidth = 520;
      const chartHeight = Math.round(chartWidth * (320 / 720));
      const placeChart = (buffer) => {
        let x = doc.x;
        let y = doc.y;
        const bottomLimit = doc.page.height - doc.page.margins.bottom;
        if (y + chartHeight > bottomLimit) {
          doc.addPage();
          x = doc.x;
          y = doc.y;
        }
        doc.image(buffer, x, y, { width: chartWidth });
        doc.y = y + chartHeight + 16;
      };

      Promise.all([renderCharts(), loadCoachBreakdown(), loadTotals()])
        .then((results) => {
          const [{ timeSeries, bySport, byCoach }, coachRows, totalsBundle] = results;
          const totals = totalsBundle.totals || { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
          const monthTotals = totalsBundle.monthTotals || { grossRevenue: 0, adminRevenue: 0, coachRevenue: 0 };
          doc.fontSize(12).fillColor('#111').text('Revenue by Month (Last 6 Months)');
          doc.moveDown(0.5);
          placeChart(timeSeries);
          doc.fontSize(12).fillColor('#111').text('Revenue by Sport');
          doc.moveDown(0.5);
          placeChart(bySport);
          doc.fontSize(12).fillColor('#111').text('Revenue by Coach');
          doc.moveDown(0.5);
          placeChart(byCoach);
          doc.moveDown(0.5);

          doc.fontSize(12).fillColor('#111').text('All-Time Totals');
          doc.fontSize(10).fillColor('#111');
          doc.text(`Gross: $${Number(totals.grossRevenue || 0).toFixed(2)}`);
          doc.text(`Platform Fee (10%): $${Number(totals.adminRevenue || 0).toFixed(2)}`);
          doc.text(`Coach Earnings (90%): $${Number(totals.coachRevenue || 0).toFixed(2)}`);
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor('#111').text(`Month ${monthKey} Totals`);
          doc.fontSize(10).fillColor('#111');
          doc.text(`Gross: $${Number(monthTotals.grossRevenue || 0).toFixed(2)}`);
          doc.text(`Platform Fee (10%): $${Number(monthTotals.adminRevenue || 0).toFixed(2)}`);
          doc.text(`Coach Earnings (90%): $${Number(monthTotals.coachRevenue || 0).toFixed(2)}`);
          doc.moveDown();

          doc.fontSize(12).fillColor('#111').text('Top Coaches by Gross');
          doc.moveDown(0.5);
          const coachRowsSafe = coachRows || [];
          coachRowsSafe.forEach((row) => {
            doc.fontSize(10).fillColor('#111').text(`${row.coach_label || 'Unknown'}: $${Number(row.gross_amount || 0).toFixed(2)}`);
          });
          doc.addPage();

          const headers = ['Booking', 'Session', 'Coach', 'Student', 'Gross', 'Fee', 'Coach'];
          const colWidths = [60, 170, 90, 90, 60, 50, 50];
          const startX = doc.x;
          let y = doc.y;

          doc.fontSize(10).fillColor('#111');
          headers.forEach((h, idx) => {
            doc.text(h, startX + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y, { width: colWidths[idx] });
          });
          y += 16;
          doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
          y += 6;

          const rowsSafe = rows || [];
          rowsSafe.forEach((row) => {
            const sessionTitle = row.listing_title || row.sport || 'Session';
            const dateLabel = row.session_date ? new Date(row.session_date).toISOString().slice(0, 10) : '';
            const timeLabel = row.session_time ? String(row.session_time).slice(0, 5) : '';
            const sessionLabel = `${sessionTitle} ${dateLabel} ${timeLabel}`.trim();
            const values = [
              `#${row.booking_id}`,
              sessionLabel,
              row.coach_name || '-',
              row.student_name || '-',
              Number(row.gross_amount || 0).toFixed(2),
              Number(row.admin_amount || 0).toFixed(2),
              Number(row.coach_amount || 0).toFixed(2)
            ];

            const rowHeight = 36;
            if (y + rowHeight > doc.page.height - 40) {
              doc.addPage();
              y = doc.y;
            }
            values.forEach((v, idx) => {
              doc.text(v, startX + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y, { width: colWidths[idx] });
            });
            y += rowHeight;
          });

          doc.end();
          return null;
        })
        .catch((chartErr) => {
          console.error('Failed to render charts for PDF', chartErr);
          doc.fontSize(12).fillColor('#b91c1c').text('Chart rendering failed. Showing table only.');
          doc.moveDown();

          const headers = ['Booking', 'Session', 'Coach', 'Student', 'Gross', 'Fee', 'Coach'];
          const colWidths = [60, 170, 90, 90, 60, 50, 50];
          const startX = doc.x;
          let y = doc.y;

          doc.fontSize(10).fillColor('#111');
          headers.forEach((h, idx) => {
            doc.text(h, startX + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y, { width: colWidths[idx] });
          });
          y += 16;
          doc.moveTo(startX, y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y).stroke();
          y += 6;

          const rowsSafe = rows || [];
          rowsSafe.forEach((row) => {
            const sessionTitle = row.listing_title || row.sport || 'Session';
            const dateLabel = row.session_date ? new Date(row.session_date).toISOString().slice(0, 10) : '';
            const timeLabel = row.session_time ? String(row.session_time).slice(0, 5) : '';
            const sessionLabel = `${sessionTitle} ${dateLabel} ${timeLabel}`.trim();
            const values = [
              `#${row.booking_id}`,
              sessionLabel,
              row.coach_name || '-',
              row.student_name || '-',
              Number(row.gross_amount || 0).toFixed(2),
              Number(row.admin_amount || 0).toFixed(2),
              Number(row.coach_amount || 0).toFixed(2)
            ];

            const rowHeight = 36;
            if (y + rowHeight > doc.page.height - 40) {
              doc.addPage();
              y = doc.y;
            }
            values.forEach((v, idx) => {
              doc.text(v, startX + colWidths.slice(0, idx).reduce((a, b) => a + b, 0), y, { width: colWidths[idx] });
            });
            y += rowHeight;
          });

          doc.end();
          return null;
        });

      return null;
    });
  }
};
