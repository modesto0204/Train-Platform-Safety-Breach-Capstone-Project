// DOM Elements
const videoPlayer = document.getElementById('videoPlayer');
const canvas = document.getElementById('detectionCanvas');
const ctx = canvas.getContext('2d');
const uploadArea = document.getElementById('uploadArea');
const videoInput = document.getElementById('videoInput');
const breachLog = document.getElementById('breachLog');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// Statistics elements
const yellowLineBreachEl = document.getElementById('yellowLineBreach');
const platformEdgeBreachEl = document.getElementById('platformEdgeBreach');
const passengerCountEl = document.getElementById('passengerCount');

// Chart variable
let breachChart;

// Statistics data
let stats = {
    yellowLineBreach: 0,
    platformEdgeBreach: 0,
    passengerCount: 3
};

document.addEventListener('DOMContentLoaded', function() {
    initializeChart();
    setupEventListeners();
    updateTimestamp();
    loadExistingBreachLog();
    updateBreachChart();
    
    // Ensure safe icon has correct structure initially
    const breachStatus = document.getElementById('breachStatus');
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.safe}" alt="Safe" class="status-icon-large safe-icon">
        </div>
        <span class="breach-text">No breach detected</span>
    `;

    // Set initial disabled state with Font Awesome bell
    const alertStatusItem = document.getElementById('alertStatusItem');
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <i class="fas fa-bell alert-icon-disabled"></i>
        </div>
        <span class="alert-text-disabled">Alert: Disabled</span>
    `;
    
    // Run demo after a delay
    setTimeout(() => {
        runBreachDemo();
    }, 1000);
});


const ICONS = {
    safe: 'assets/icons/safe_icon.png',
    yellowWarning: 'assets/icons/yellowwarning_icon.png',
    redWarning: 'assets/icons/redwarning_icon.png',
    yellowAlert: 'assets/icons/yellowalert_icon.png',
    redAlert: 'assets/icons/redalert_icon.png',
    alertDisabled: 'assets/icons/alert_disabled_icon.png' // You might need a disabled state icon
};
function updateStatistics() {
    yellowLineBreachEl.textContent = stats.yellowLineBreach;
    platformEdgeBreachEl.textContent = stats.platformEdgeBreach;
    passengerCountEl.textContent = stats.passengerCount;
}
// Function to update the breach breakdown chart
function updateBreachChart() {
    const total = totalBreachCounts.yellow + totalBreachCounts.red;
    const breakdownSection = document.querySelector('.breach-breakdown-section');
    
    if (total === 0) {
        breakdownSection.classList.add('no-data');
        // Show equal split but with 0% in legend
        breachChart.data.datasets[0].data = [50, 50];
        document.querySelector('.legend-item:nth-child(1) span:last-child').textContent = 'Yellow Line 0%';
        document.querySelector('.legend-item:nth-child(2) span:last-child').textContent = 'Platform Edge 0%';
    } else {
        breakdownSection.classList.remove('no-data');
        const yellowPercentage = Math.round((totalBreachCounts.yellow / total) * 100);
        const redPercentage = Math.round((totalBreachCounts.red / total) * 100);
        
        breachChart.data.datasets[0].data = [yellowPercentage, redPercentage];
        
        document.querySelector('.legend-item:nth-child(1) span:last-child').textContent = 
            `Yellow Line ${yellowPercentage}%`;
        document.querySelector('.legend-item:nth-child(2) span:last-child').textContent = 
            `Platform Edge ${redPercentage}%`;
    }
    
    breachChart.update();
}

// Setup event listeners
function setupEventListeners() {
    // File upload
    uploadArea.addEventListener('click', () => videoInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    videoInput.addEventListener('change', handleFileSelect);
    
    // Video events
    videoPlayer.addEventListener('loadedmetadata', handleVideoLoad);
    
    // Fullscreen button
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
}

// File handling functions
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(30, 58, 95, 0.98)';
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.style.backgroundColor = 'rgba(30, 58, 95, 0.95)';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('video/')) {
            loadVideo(file);
        } else {
            alert('Please upload a video file');
        }
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
        loadVideo(file);
    }
}

function loadVideo(file) {
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
    uploadArea.classList.add('hidden');
}

function handleVideoLoad() {
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
}

// Load existing breach log entries
function loadExistingBreachLog() {
    const mockEntries = [
        { type: 'yellow', time: '12:47:05', location: 'Yellow Line' },
        { type: 'red', time: '12:41:18', location: 'Platform Edge' },
        { type: 'yellow', time: '12:33:50', location: 'Yellow Line' },
        { type: 'red', time: '11:41:18', location: 'Platform Edge' },
        { type: 'yellow', time: '10:33:50', location: 'Yellow Line' }
    ];
    
    breachLog.innerHTML = '';
    mockEntries.forEach(entry => {
        addBreachEntry(entry.type, entry.time, entry.location);
    });
}

function addBreachEntry(type, time, location) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="log-dot ${type}"></span>
        <span class="log-time">${time}</span>
        <span class="log-location">${location}</span>
    `;
    breachLog.appendChild(entry);
}

// Chart functions
let totalBreachCounts = {
    yellow: 0,  // Start with 0 breaches
    red: 0      // Start with 0 breaches
};

function initializeChart() {
    const ctx = document.getElementById('breachChart').getContext('2d');
    breachChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Yellow Line', 'Platform Edge'],
            datasets: [{
                data: [50, 50], // Equal split when no data
                backgroundColor: ['#ffd700', '#ff4444'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Update legend to show 0% initially
    document.querySelector('.legend-item:nth-child(1) span:last-child').textContent = 'Yellow Line 0%';
    document.querySelector('.legend-item:nth-child(2) span:last-child').textContent = 'Platform Edge 0%';
}

// UI functions
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoPlayer.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function updateTimestamp() {
    setInterval(() => {
        const timestamp = document.getElementById('timestamp');
        const seconds = Math.floor(Math.random() * 60);
        const minutes = Math.floor(Math.random() * 5);
        timestamp.textContent = `${minutes}m ${seconds}s ago`;
    }, 5000);
}

// Breach detection functions

function clearBreach() {
    console.log('Clearing breach status...');
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    
    // Remove all breach classes
    statusBar.classList.remove('yellow-breach', 'red-breach', 'both-breach');
    
    // Restore the safe icon with wrapper
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.safe}" alt="Safe" class="status-icon-large safe-icon">
        </div>
        <span class="breach-text">No breach detected</span>
    `;
    
    // Restore alert to disabled with Font Awesome bell
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <i class="fas fa-bell alert-icon-disabled"></i>
        </div>
        <span class="alert-text-disabled">Alert: Disabled</span>
    `;
    
    // Reset statistics
    stats.yellowLineBreach = 0;
    stats.platformEdgeBreach = 0;
    stats.passengerCount = 3;
    updateStatistics();
}

// Update the breach simulation functions to use Font Awesome bell for alerts
function simulateYellowLineBreach() {
    console.log('Yellow line breach detected!');
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    
    statusBar.classList.remove('red-breach', 'both-breach');
    statusBar.classList.add('yellow-breach');
    
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.yellowWarning}" alt="Yellow Warning" class="status-icon-large warning-icon">
        </div>
        <span class="breach-text">Warning: zone breach</span>
    `;
    
    // Use yellow alert icon for alert enabled
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.yellowAlert}" alt="Alert Active" class="status-icon-large warning-icon">
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    // Rest of the function remains the same...
    const currentTime = new Date();
    const timeString = currentTime.toTimeString().split(' ')[0];
    addNewBreachEntry('yellow', timeString, 'Yellow Line');
    
    stats.yellowLineBreach++;
    totalBreachCounts.yellow++;
    stats.passengerCount = Math.floor(Math.random() * 5) + 3;
    updateStatistics();
    updateBreachChart();
}

function simulatePlatformEdgeBreach() {
    console.log('Platform edge breach detected!');
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    
    statusBar.classList.remove('yellow-breach', 'both-breach');
    statusBar.classList.add('red-breach');
    
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.redWarning}" alt="Red Warning" class="status-icon-large warning-icon">
        </div>
        <span class="breach-text">Warning: zone breach</span>
    `;
    
    // Use red alert icon for alert enabled
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.redAlert}" alt="Alert Active" class="status-icon-large warning-icon">
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    // Rest of the function remains the same...
    const currentTime = new Date();
    const timeString = currentTime.toTimeString().split(' ')[0];
    addNewBreachEntry('red', timeString, 'Platform Edge');
    
    stats.platformEdgeBreach++;
    totalBreachCounts.red++;
    stats.passengerCount = Math.floor(Math.random() * 5) + 5;
    updateStatistics();
    updateBreachChart();
}

function simulateBothBreaches() {
    console.log('Both breaches detected!');
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    
    statusBar.classList.remove('yellow-breach', 'red-breach');
    statusBar.classList.add('both-breach');
    
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.redWarning}" alt="Critical Warning" class="status-icon-large warning-icon">
        </div>
        <span class="breach-text">CRITICAL: Multiple breaches detected</span>
    `;
    
    // Use red alert icon for alert enabled
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.redAlert}" alt="Alert Active" class="status-icon-large warning-icon">
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    // Rest of the function remains the same...
    const currentTime = new Date();
    const timeString = currentTime.toTimeString().split(' ')[0];
    addNewBreachEntry('red', timeString, 'Platform Edge');
    addNewBreachEntry('yellow', timeString, 'Yellow Line');
    
    stats.yellowLineBreach = 1;
    stats.platformEdgeBreach = 1;
    totalBreachCounts.yellow++;
    totalBreachCounts.red++;
    stats.passengerCount = 8;
    updateStatistics();
    updateBreachChart();
}

function loadExistingBreachLog() {
    // Clear the breach log and add "no breaches yet" message
    breachLog.innerHTML = '<div class="no-breaches">No breaches yet</div>';
}

// Add new breach entry to the log (prepend to top)
function addNewBreachEntry(type, time, location) {
    // Remove "no breaches yet" message if it exists
    const noBreachesMsg = breachLog.querySelector('.no-breaches');
    if (noBreachesMsg) {
        noBreachesMsg.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.opacity = '0'; // Start invisible
    entry.innerHTML = `
        <span class="log-dot ${type}"></span>
        <span class="log-time">${time}</span>
        <span class="log-location">${location}</span>
    `;
    
    // Add to top of log
    breachLog.insertBefore(entry, breachLog.firstChild);
    
    // Animate entry appearance
    setTimeout(() => {
        entry.style.transition = 'opacity 0.3s ease';
        entry.style.opacity = '1';
    }, 10);
    
    // Keep only last 10 entries
    while (breachLog.children.length > 10) {
        breachLog.removeChild(breachLog.lastChild);
    }
}

// Navigation function for FAQ
function showFAQ() {
    window.location.href = 'faq.html';
}

function showHelp() {
    window.location.href = 'help.html';
}

// Test functions for console
window.testYellowBreach = function() {
    simulateYellowLineBreach();
    setTimeout(clearBreach, 5000);
};

window.testRedBreach = function() {
    simulatePlatformEdgeBreach();
    setTimeout(clearBreach, 5000);
};

window.testBothBreaches = function() {
    simulateBothBreaches();
    setTimeout(clearBreach, 5000);
};

// Demo sequence - cycles through different breach types
window.runBreachDemo = function() {
    console.log('Starting breach demo...');
    
    // Yellow line breach after 2 seconds
    setTimeout(() => {
        simulateYellowLineBreach();
    }, 2000);
    
    // Clear after 5 seconds
    setTimeout(() => {
        clearBreach();
    }, 5000);
    
    // Platform edge breach after 7 seconds
    setTimeout(() => {
        simulatePlatformEdgeBreach();
    }, 7000);
    
    // Clear after 10 seconds
    setTimeout(() => {
        clearBreach();
    }, 10000);
    
    // Both breaches after 12 seconds
    setTimeout(() => {
        simulateBothBreaches();
    }, 12000);
    
    // Clear after 15 seconds
    setTimeout(() => {
        clearBreach();
    }, 15000);
};

// Manual trigger for testing
window.testBreach = function() {
    simulateBreach();
};