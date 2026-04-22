// Configuration & Global Variables
let miningData = [];
let mines = []; // List of detected mine names
let chartInstance = null;

const UI = {
    loadBtn: document.getElementById('load-btn'),
    csvUrl: document.getElementById('csv-url'),
    dashboard: document.getElementById('dashboard'),
    welcome: document.getElementById('welcome-screen'),
    mineSelect: document.getElementById('mine-select'),
    stats: {
        mean: document.getElementById('stat-mean'),
        std: document.getElementById('stat-std'),
        median: document.getElementById('stat-median'),
        iqr: document.getElementById('stat-iqr')
    },
    anomalyLog: document.getElementById('anomaly-log'),
    anomalyCount: document.getElementById('anomaly-count'),
    chartType: document.getElementById('chart-type'),
    trendDegree: document.getElementById('trend-degree'),
    zThreshold: document.getElementById('z-threshold'),
    iqrFactor: document.getElementById('iqr-factor'),
    maWindow: document.getElementById('ma-window'),
    maThreshold: document.getElementById('ma-threshold'),
    pdfBtn: document.getElementById('pdf-btn')
};

// Event Listeners
UI.loadBtn.addEventListener('click', loadData);
UI.mineSelect.addEventListener('change', updateUI);
UI.chartType.addEventListener('change', updateUI);
UI.trendDegree.addEventListener('change', updateUI);
UI.zThreshold.addEventListener('input', updateUI);
UI.iqrFactor.addEventListener('input', updateUI);
UI.maWindow.addEventListener('input', updateUI);
UI.maThreshold.addEventListener('input', updateUI);
UI.pdfBtn.addEventListener('click', generatePDF);

async function loadData() {
    const url = UI.csvUrl.value.trim();
    if (!url) {
        alert("Please enter a valid Google Sheets CSV URL.");
        return;
    }

    UI.loadBtn.textContent = "COMMUNICATING...";
    UI.loadBtn.disabled = true;

    Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            UI.loadBtn.textContent = "LOAD DATA SOURCE";
            UI.loadBtn.disabled = false;
            
            if (results.data && results.data.length > 0) {
                // Pre-process data: Convert comma decimals to dots and strings to numbers
                miningData = results.data.filter(row => row.Date).map(row => {
                    const newRow = { ...row };
                    Object.keys(newRow).forEach(key => {
                        if (key !== 'Date' && typeof newRow[key] === 'string') {
                            // Replace comma with dot and parse as float
                            const cleaned = newRow[key].replace(',', '.').replace(/[^\d.-]/g, '');
                            const num = parseFloat(cleaned);
                            if (!isNaN(num)) newRow[key] = num;
                        }
                    });
                    return newRow;
                });

                // Detect mine columns
                const headers = results.meta.fields;
                mines = headers.filter(h => h.toLowerCase().includes('mine') || h === 'FINAL OUTPUT' || h === 'Raw Value');
                
                if (mines.length === 0) {
                    mines = headers.filter(h => !['date', 'total', 'trend'].includes(h.toLowerCase()));
                }

                populateMineSelect();
                showDashboard();
                updateUI();
            } else {
                alert("Data received is empty or malformed.");
            }
        },
        error: function(err) {
            console.error("PapaParse Error:", err);
            alert("Failed to reach data source. Check Console (F12) for details. Usually this is a CORS block—ensure you are running a local server (python3 -m http.server).");
            UI.loadBtn.textContent = "LOAD DATA SOURCE";
            UI.loadBtn.disabled = false;
        }
    });
}

function populateMineSelect() {
    // Clear except "total"
    while (UI.mineSelect.options.length > 1) {
        UI.mineSelect.remove(1);
    }
    mines.forEach(mine => {
        const opt = document.createElement('option');
        opt.value = mine;
        opt.textContent = mine;
        UI.mineSelect.appendChild(opt);
    });
}

function showDashboard() {
    UI.welcome.style.display = 'none';
    UI.dashboard.style.display = 'block';
}

function updateUI() {
    if (miningData.length === 0) return;
    
    const activeMine = UI.mineSelect.value;
    const dates = miningData.map(d => d.Date);
    
    let values;
    if (activeMine === 'total') {
        // Try to find a Total column, or sum mines
        values = miningData.map(d => {
            if (d['TOTAL OUTPUT'] !== undefined) return d['TOTAL OUTPUT'];
            if (d['Total'] !== undefined) return d['Total'];
            return mines.reduce((sum, m) => sum + (d[m] || 0), 0);
        });
    } else {
        values = miningData.map(d => d[activeMine] || 0);
    }

    const stats = calculateStats(values);
    const anomalies = detectAnomalies(values, dates);
    
    updateStatsDisplay(stats);
    updateAnomalyLog(anomalies);
    renderChart(dates, values, anomalies, activeMine);
}

function calculateStats(values) {
    if (values.length === 0) return {};
    return {
        mean: ss.mean(values),
        std: ss.standardDeviation(values),
        median: ss.median(values),
        iqr: ss.interquartileRange(values),
        q1: ss.quantile(values, 0.25),
        q3: ss.quantile(values, 0.75)
    };
}

function detectAnomalies(values, dates) {
    const stats = calculateStats(values);
    const zT = parseFloat(UI.zThreshold.value);
    const iqrF = parseFloat(UI.iqrFactor.value);
    const maW = parseInt(UI.maWindow.value);
    const maT = parseFloat(UI.maThreshold.value);
    
    // Grubbs Critical Value Approximation (N > 10, alpha 0.05)
    const n = values.length;
    const gCrit = (n - 1) / Math.sqrt(n) * Math.sqrt(Math.pow(2.5, 2) / (n - 2 + Math.pow(2.5, 2))); // Simple approx

    return values.map((val, idx) => {
        const zScore = Math.abs(val - stats.mean) / stats.std;
        const isIQR = (val < stats.q1 - iqrF * stats.iqr) || (val > stats.q3 + iqrF * stats.iqr);
        
        // Moving Average
        const start = Math.max(0, idx - Math.floor(maW/2));
        const end = Math.min(values.length, idx + Math.ceil(maW/2));
        const ma = ss.mean(values.slice(start, end));
        const maDist = ((Math.abs(val - ma)) / ma) * 100;
        
        const grubbsG = Math.abs(val - stats.mean) / stats.std;
        
        const isAnomaly = zScore > zT || isIQR || maDist > maT || grubbsG > 3.0;

        return {
            date: dates[idx],
            value: val,
            zScore: zScore.toFixed(2),
            isIQR: isIQR ? "FLAGGED" : "OK",
            maDist: maDist.toFixed(1) + "%",
            grubbs: grubbsG.toFixed(2),
            isAnomaly
        };
    });
}

function updateStatsDisplay(stats) {
    UI.stats.mean.textContent = stats.mean.toFixed(2);
    UI.stats.std.textContent = stats.std.toFixed(2);
    UI.stats.median.textContent = stats.median.toFixed(2);
    UI.stats.iqr.textContent = stats.iqr.toFixed(2);
}

function updateAnomalyLog(anomalies) {
    UI.anomalyLog.innerHTML = "";
    const flagged = anomalies.filter(a => a.isAnomaly);
    UI.anomalyCount.textContent = `${flagged.length} Detected`;
    
    flagged.forEach(a => {
        const row = document.createElement('tr');
        row.className = 'is-anomaly';
        row.innerHTML = `
            <td>${a.date}</td>
            <td>${a.value.toFixed(2)}</td>
            <td>${a.zScore}</td>
            <td>${a.isIQR}</td>
            <td>${a.maDist}</td>
            <td>${a.grubbs}</td>
        `;
        UI.anomalyLog.appendChild(row);
    });
}

function renderChart(dates, values, anomalies, activeMine) {
    const ctx = document.getElementById('main-chart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    const chartType = UI.chartType.value;
    const isStacked = chartType.startsWith('stacked-');
    const trendDegree = parseInt(UI.trendDegree.value);
    
    let datasets = [];

    if (isStacked) {
        datasets = mines.map((mine, idx) => ({
            label: mine,
            data: miningData.map(d => d[mine] || 0),
            backgroundColor: `hsla(${idx * (360/mines.length)}, 70%, 50%, 0.6)`,
            borderColor: `hsla(${idx * (360/mines.length)}, 70%, 50%, 1)`,
            fill: chartType === 'stacked-area',
            stack: 'combined'
        }));
    } else {
        datasets.push({
            label: activeMine === 'total' ? 'Total Resource Output' : `${activeMine} Output`,
            data: values,
            borderColor: '#6366f1', // Indigo 500
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            borderWidth: 2,
            pointRadius: anomalies.map(a => a.isAnomaly ? 6 : 2),
            pointBackgroundColor: anomalies.map(a => a.isAnomaly ? '#ef4444' : '#6366f1'),
            fill: chartType === 'bar' ? false : true
        });

        if (trendDegree > 0) {
            const dataPairs = values.map((v, i) => [i, v]);
            const reg = trendDegree === 1 ? regression.linear(dataPairs) : regression.polynomial(dataPairs, { order: trendDegree });
            datasets.push({
                label: `Trendline (Deg ${trendDegree})`,
                data: reg.points.map(p => p[1]),
                borderColor: '#c084fc', // Purple 400
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            });
        }
    }

    chartInstance = new Chart(ctx, {
        type: chartType.includes('bar') ? 'bar' : 'line',
        data: { labels: dates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    stacked: isStacked,
                    grid: { color: '#1e293b' }, 
                    ticks: { color: '#94a3b8' } 
                },
                x: { 
                    stacked: isStacked,
                    grid: { display: false }, 
                    ticks: { color: '#94a3b8' } 
                }
            },
            plugins: {
                legend: { position: 'top', labels: { color: '#f8fafc', font: { family: 'Inter', size: 10 } } }
            }
        }
    });
}

async function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4');
    const chartArea = document.getElementById('chart-capture-area');
    
    UI.pdfBtn.textContent = "WAIT...";
    UI.pdfBtn.disabled = true;

    try {
        const canvas = await html2canvas(chartArea, { backgroundColor: '#10141d' });
        const imgData = canvas.toDataURL('image/png');
        
        // Header
        doc.setFillColor(15, 23, 42); 
        doc.rect(0, 0, 600, 100, 'F');
        doc.setTextColor(248, 250, 252); 
        doc.setFont("helvetica", "bold");
        doc.setFontSize(24);
        doc.text("REPORT", 40, 50);
        doc.setFontSize(14);
        doc.setTextColor(129, 140, 248); 
        doc.text("ANALYTICS", 40, 75);
        
        // Info
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(148, 163, 184); 
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 40, 120);
        doc.text(`Source: ${UI.mineSelect.value}`, 40, 135);
        
        // Summary Stats
        doc.setDrawColor(51, 65, 85); 
        doc.line(40, 150, 550, 150);
        
        doc.setFontSize(12);
        doc.setTextColor(248, 250, 252);
        doc.text("SUMMARY", 40, 175);
        
        const stats = [
            ["Mean", UI.stats.mean.textContent],
            ["Std Dev", UI.stats.std.textContent],
            ["Median", UI.stats.median.textContent],
            ["IQR", UI.stats.iqr.textContent]
        ];
        
        doc.autoTable({
            startY: 190,
            head: [['Metric', 'Value']],
            body: stats,
            theme: 'striped',
            headStyles: { fillColor: [99, 102, 241], textColor: 255 }, 
            styles: { fontSize: 10, cellPadding: 5 }
        });
        
        // Chart
        doc.text("CHART", 40, doc.lastAutoTable.finalY + 30);
        doc.addImage(imgData, 'PNG', 40, doc.lastAutoTable.finalY + 40, 515, 250);
        
        doc.addPage();
        
        // Anomalies
        doc.setFontSize(16);
        doc.setTextColor(239, 68, 68); 
        doc.text("ANOMALIES", 40, 50);
        
        const anomalyRows = [];
        UI.anomalyLog.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent);
            anomalyRows.push(cells);
        });
        
        doc.autoTable({
            startY: 70,
            head: [['Date', 'Value', 'Z', 'IQR', 'MA', 'G']],
            body: anomalyRows,
            theme: 'grid',
            headStyles: { fillColor: [239, 68, 68] },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            styles: { fontSize: 8 }
        });

        doc.save(`Report_${UI.mineSelect.value}.pdf`);
    } catch (e) {
        console.error(e);
        alert("Error.");
    } finally {
        UI.pdfBtn.textContent = "PDF";
        UI.pdfBtn.disabled = false;
    }
}
