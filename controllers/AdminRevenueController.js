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
      return AdminRevenue.getMonthlyReport(monthKey, (repErr, rows) => {
        if (repErr) {
          console.error('Failed to load monthly report', repErr);
          rows = [];
        }
        return AdminRevenue.getMonthlyRevenueSeries(monthKey, (seriesErr, seriesRows) => {
          if (seriesErr) {
            console.error('Failed to load revenue series', seriesErr);
            seriesRows = [];
          }
          return AdminRevenue.getRevenueBySport(monthKey, (sportErr, sportRows) => {
            if (sportErr) {
              console.error('Failed to load revenue by sport', sportErr);
              sportRows = [];
            }
            const labels = (seriesRows || []).map((row) => row.period);
            const gross = (seriesRows || []).map((row) => Number(row.gross_amount || 0));
            const adminFee = gross.map((val) => Number((val * 0.1).toFixed(2)));
            const coachNet = gross.map((val) => Number((val * 0.9).toFixed(2)));
            const sportLabels = (sportRows || []).map((row) => row.sport_label);
            const sportGross = (sportRows || []).map((row) => Number(row.gross_amount || 0));

            return res.render('adminRevenue', {
              user: req.session.user,
              totals,
              reportMonth: monthKey,
              reportRows: rows || [],
              charts: {
                labels,
                gross,
                adminFee,
                coachNet,
                sportLabels,
                sportGross
              },
              messages: res.locals.messages,
              active: 'revenue'
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
      const csv = buildCsv(rows || []);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${monthKey}.csv"`);
      return res.send(csv);
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
          AdminRevenue.getMonthlyRevenueSeries(monthKey, (seriesErr, seriesRows) => {
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
              const adminFee = gross.map((val) => Number((val * 0.1).toFixed(2)));
              const coachNet = gross.map((val) => Number((val * 0.9).toFixed(2)));
              const sportLabels = (sportRows || []).map((row) => row.sport_label);
              const sportGross = (sportRows || []).map((row) => Number(row.gross_amount || 0));
              return resolve({ labels, gross, adminFee, coachNet, sportLabels, sportGross });
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
              { label: 'Gross', data: chartData.gross, borderColor: '#0f172a', tension: 0.3, fill: false },
              { label: 'Admin Fee', data: chartData.adminFee, borderColor: '#f97316', tension: 0.3, fill: false },
              { label: 'Coach Net', data: chartData.coachNet, borderColor: '#16a34a', tension: 0.3, fill: false }
            ]
          },
          options: {
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { ticks: { callback: (value) => '$' + value } } }
          }
        };
        const sportConfig = {
          type: 'bar',
          data: {
            labels: chartData.sportLabels,
            datasets: [{ label: 'Gross', data: chartData.sportGross, backgroundColor: '#2563eb' }]
          },
          options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { callback: (value) => '$' + value } } }
          }
        };
        const timeUrl = `https://quickchart.io/chart?width=720&height=320&format=png&c=${encodeURIComponent(JSON.stringify(timeConfig))}`;
        const sportUrl = `https://quickchart.io/chart?width=720&height=320&format=png&c=${encodeURIComponent(JSON.stringify(sportConfig))}`;
        const [timeRes, sportRes] = await Promise.all([
          axios.get(timeUrl, { responseType: 'arraybuffer' }),
          axios.get(sportUrl, { responseType: 'arraybuffer' })
        ]);
        return { timeSeries: Buffer.from(timeRes.data), bySport: Buffer.from(sportRes.data) };
      };

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="sales-report-${monthKey}.pdf"`);

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      doc.pipe(res);

      doc.fontSize(18).text(`Sales Report - ${monthKey}`, { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#555').text(`Generated: ${new Date().toLocaleString('en-SG')}`);
      doc.moveDown();

      renderCharts()
        .then(({ timeSeries, bySport }) => {
          doc.fontSize(12).fillColor('#111').text('Revenue Over Time');
          doc.image(timeSeries, { width: 520 });
          doc.moveDown();
          doc.fontSize(12).fillColor('#111').text('Revenue by Sport');
          doc.image(bySport, { width: 520 });
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
