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

const API_BASE_URL = 'http://localhost:5000';
let detectionInterval = null;
let isProcessing = false;

// Chart variable
let breachChart;

// Statistics data
let stats = {
    yellowLineBreach: 0,
    platformEdgeBreach: 0,
    passengerCount: 0
};

let isTrainPresent = false;
let boardingModeActive = false;
let trainStatusInterval = null;

let showZones = false;
let zoneData = null;

let isTransitioning = false;

let breachTimerStartTime = null;
let breachTimerInterval = null;
let currentBreachState = 'safe';

let cumulativeBreachCounts = {
    yellow: 0,
    red: 0
};

let breachTracking = {};

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeBreachLogModal();
        closeBreachChartModal();
    }
});

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        if (e.target.id === 'breachLogModal') {
            closeBreachLogModal();
        } else if (e.target.id === 'breachChartModal') {
            closeBreachChartModal();
        }
    }
});

document.addEventListener('DOMContentLoaded', async function() {
    initializeChart();
    setupEventListeners();
    updateTimestamp();
    loadExistingBreachLog();
    updateBreachChart();
    
    const serverRunning = await checkServerHealth();
    if (serverRunning) {
        console.log('Detection server is running!');
        startTrainStatusMonitoring();
    } else {
        console.warn('Detection server is not running. Using demo mode.');
        setTimeout(() => {
            runBreachDemo();
        }, 1000);
    }
    
     // Check if we're on the prediction page
    if (window.location.pathname.includes('prediction')) {
        // Load predictions immediately
        loadCrowdPredictions();
        
        // Refresh every 10 seconds to match detection interval
        setInterval(loadCrowdPredictions, 10000);
    }

    const breachStatus = document.getElementById('breachStatus');
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.safe}" alt="Safe" class="status-icon-large safe-icon">
        </div>
        <span class="breach-text">No breach detected</span>
    `;

    const alertStatusItem = document.getElementById('alertStatusItem');
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.alertDisabled}" alt="Alert Disabled" style="width: 24px; height: 24px; object-fit: contain;">
        </div>
        <span class="alert-text-disabled">Alert: Disabled</span>
    `;

    makeBreachLogClickable();
    makeBreachChartClickable();
    initializeTrainToggle();
});

window.addEventListener('resize', () => {
    if (videoPlayer.videoWidth > 0) {
        window.videoScaling = getVideoScaling();
    }
});

document.addEventListener('fullscreenchange', () => {
    setTimeout(() => {
        if (videoPlayer.videoWidth > 0) {
            window.videoScaling = getVideoScaling();
            if (showZones) {
                drawZones();
            }
        }
    }, 100);
});


const ALARMS = {
    yellowLine: new Audio('assets/alarms/yellow_line.mp3'),
    platformEdge: new Audio('assets/alarms/platform_edge.mp3'),
    multipleBreach: new Audio('assets/alarms/multiple_breach.mp3')
};

const ICONS = {
    safe: 'assets/icons/safe_icon.png',
    yellowWarning: 'assets/icons/yellowwarning_icon.png',
    redWarning: 'assets/icons/redwarning_icon.png',
    alertDisabled: 'assets/icons/bell_icon.png'
};

Object.values(ALARMS).forEach(alarm => {
    alarm.loop = true;
    alarm.volume = 0.7;
});

let breachTimers = {
    yellow: null,
    red: null,
    both: null
};

let activeAlarm = null;
let currentBreachType = null;
let breachStartTime = null;

async function checkTrainStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/train_status`);
        const data = await response.json();
        
        if (data.success) {
            const serverTrainPresent = data.train_present;
            
            if (serverTrainPresent !== isTrainPresent) {
                console.log(`Train status changed: ${isTrainPresent} → ${serverTrainPresent}`);
                handleTrainStatusChange(serverTrainPresent);
            }
        }
    } catch (error) {
        console.error('Error checking train status:', error);
    }
}

function handleTrainStatusChange(trainPresent) {
    isTrainPresent = trainPresent;
    boardingModeActive = trainPresent;
    
    const trainToggle = document.getElementById('trainPresentToggle');
    if (trainToggle) {
        trainToggle.checked = trainPresent;
    }
    
    const trainControl = document.querySelector('.train-status-control');
    
    if (trainPresent) {
        if (trainControl) {
            trainControl.classList.add('active');
        }
        
        activateBoardingMode();
        
        console.log('[AUTO] Train detected - System automatically switched to boarding mode');
        showTrainDetectionNotification(true);
        
    } else {
        if (trainControl) {
            trainControl.classList.remove('active');
        }
        removeBoardingIndicator();
        
        console.log('[AUTO] Train departed - Normal operation automatically resumed');
        showTrainDetectionNotification(false);
    }
}

function showTrainDetectionNotification(trainDetected) {
    const notification = document.createElement('div');
    notification.className = 'train-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${trainDetected ? '#2196F3' : '#4CAF50'};
        color: white;
        padding: 15px 25px;
        border-radius: 8px;
        font-weight: bold;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-train" style="font-size: 18px;"></i>
            <span>${trainDetected ? 'Train Detected - Detection Paused' : 'Train Departed - Detection Resumed'}</span>
        </div>
    `;
    
    if (!document.getElementById('train-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'train-notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function startTrainStatusMonitoring() {
    trainStatusInterval = setInterval(checkTrainStatus, 500);
    console.log('Started automatic train status monitoring');
}

function stopTrainStatusMonitoring() {
    if (trainStatusInterval) {
        clearInterval(trainStatusInterval);
        trainStatusInterval = null;
        console.log('Stopped train status monitoring');
    }
}

async function checkServerHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        const data = await response.json();
        console.log('Server health:', data);
        return data.status === 'running';
    } catch (error) {
        console.error('Server health check failed:', error);
        return false;
    }
}

async function fetchStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/stats`);
        const data = await response.json();
        console.log('Server stats available:', data);
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

let currentFrameStats = {
    yellowBreaches: 0,
    redBreaches: 0,
    passengers: 0
};

function formatElapsedTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000) + 1;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
}

function updateBreachTimerDisplay() {
    const timestampEl = document.getElementById('timestamp');
    
    if (breachTimerStartTime && currentBreachState !== 'safe') {
        const elapsed = Date.now() - breachTimerStartTime;
        timestampEl.textContent = `${formatElapsedTime(elapsed)} in breach`;
    } else {
        timestampEl.textContent = 'Safe';
    }
}

function startBreachTimerDisplay() {
    if (breachTimerInterval) {
        clearInterval(breachTimerInterval);
    }
    
    breachTimerStartTime = Date.now();
    updateBreachTimerDisplay();
    breachTimerInterval = setInterval(updateBreachTimerDisplay, 1000);
}

function stopBreachTimerDisplay() {
    if (breachTimerInterval) {
        clearInterval(breachTimerInterval);
        breachTimerInterval = null;
    }
    breachTimerStartTime = null;
}

let detectionBuffer = {};
let BUFFER_SIZE = 1;

function startBreachTimer(breachType) {
    clearAllBreachTimers();
    
    currentBreachType = breachType;
    breachStartTime = Date.now();
    
    console.log(`Starting ${breachType} breach timer...`);
    
    breachTimers[breachType] = setTimeout(() => {
        playAlarm(breachType);
    }, 4000);
}

function clearAllBreachTimers() {
    console.log('Clearing all breach timers');
    
    Object.keys(breachTimers).forEach(type => {
        if (breachTimers[type]) {
            clearTimeout(breachTimers[type]);
            breachTimers[type] = null;
            console.log(`Cleared ${type} breach timer`);
        }
    });
    
    stopAllAlarms();
    
    currentBreachType = null;
    breachStartTime = null;
}

function playAlarm(breachType) {
    stopAllAlarms();
    
    switch(breachType) {
        case 'yellow':
            activeAlarm = ALARMS.yellowLine;
            break;
        case 'red':
            activeAlarm = ALARMS.platformEdge;
            break;
        case 'both':
            activeAlarm = ALARMS.multipleBreach;
            break;
    }
    
    if (activeAlarm) {
        activeAlarm.play().catch(e => {
            console.error('Error playing alarm:', e);
        });
        console.log(`Playing ${breachType} breach alarm`);
    }
}

function stopAllAlarms() {
    Object.values(ALARMS).forEach(alarm => {
        alarm.pause();
        alarm.currentTime = 0;
    });
    activeAlarm = null;
}

function getTimeUntilAlarm() {
    if (!breachStartTime || !currentBreachType) return null;
    
    const elapsed = Date.now() - breachStartTime;
    const remaining = Math.max(0, 5000 - elapsed);
    return remaining / 1000;
}

function smoothDetections(newDetections) {
    newDetections.forEach(det => {
        if (!detectionBuffer[det.track_id]) {
            detectionBuffer[det.track_id] = [];
        }
        detectionBuffer[det.track_id].push(det);
        
        if (detectionBuffer[det.track_id].length > BUFFER_SIZE) {
            detectionBuffer[det.track_id].shift();
        }
    });
    
    let smoothedDetections = [];
    for (let trackId in detectionBuffer) {
        let buffer = detectionBuffer[trackId];
        if (buffer.length > 0) {
            let avgDet = {
                ...buffer[buffer.length - 1],
                x1: 0, y1: 0, x2: 0, y2: 0
            };
            
            buffer.forEach(det => {
                avgDet.x1 += det.x1 / buffer.length;
                avgDet.y1 += det.y1 / buffer.length;
                avgDet.x2 += det.x2 / buffer.length;
                avgDet.y2 += det.y2 / buffer.length;
            });
            
            smoothedDetections.push(avgDet);
        }
    }
    
    for (let trackId in detectionBuffer) {
        let found = newDetections.find(d => d.track_id == trackId);
        if (!found) {
            detectionBuffer[trackId].shift();
            if (detectionBuffer[trackId].length === 0) {
                delete detectionBuffer[trackId];
            }
        }
    }
    
    return smoothedDetections;
}

let currentDetections = [];
let breachDurationTracking = {};

// NEW: Function to draw train bounding boxes
function drawTrainBoundingBoxes(trainBboxes) {
    if (!trainBboxes || trainBboxes.length === 0) return;
    
    // Get video element to calculate proper scaling
    const video = document.querySelector('video');
    const canvas = ctx.canvas;
    
    // Calculate scaling based on actual video and canvas dimensions
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;
    
    ctx.save();
    
    trainBboxes.forEach(train => {
        // Scale the bbox coordinates
        const x1 = train.bbox[0] * scaleX;
        const y1 = train.bbox[1] * scaleY;
        const x2 = train.bbox[2] * scaleX;
        const y2 = train.bbox[3] * scaleY;
        
        const width = x2 - x1;
        const height = y2 - y1;
        
        // Draw bounding box with rounded corners effect
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#2196F3';
        ctx.shadowColor = 'rgba(33, 150, 243, 0.5)';
        ctx.shadowBlur = 8;
        ctx.strokeRect(x1, y1, width, height);
        ctx.shadowBlur = 0; // Reset shadow
        
        // Create label
        const label = `${train.class_name.toUpperCase()} ${(train.confidence * 100).toFixed(0)}%`;
        const fontSize = 16;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textBaseline = 'top';
        
        const metrics = ctx.measureText(label);
        const padding = 8;
        const labelWidth = metrics.width + (padding * 2);
        const labelHeight = fontSize + (padding * 1.5);
        
        // Position label above the box
        let labelX = x1;
        let labelY = y1 - labelHeight - 5;
        
        // If label goes off top, place it inside the box at top
        if (labelY < 0) {
            labelY = y1 + 5;
        }
        
        // If label goes off left, adjust
        if (labelX < 0) {
            labelX = 5;
        }
        
        // If label goes off right, align to right edge of box
        if (labelX + labelWidth > canvas.width) {
            labelX = x2 - labelWidth;
        }
        
        // Draw label background with gradient
        const gradient = ctx.createLinearGradient(labelX, labelY, labelX, labelY + labelHeight);
        gradient.addColorStop(0, 'rgba(33, 150, 243, 0.95)');
        gradient.addColorStop(1, 'rgba(25, 118, 210, 0.95)');
        ctx.fillStyle = gradient;
        
        // Rounded rectangle for label background
        const radius = 4;
        ctx.beginPath();
        ctx.moveTo(labelX + radius, labelY);
        ctx.lineTo(labelX + labelWidth - radius, labelY);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY, labelX + labelWidth, labelY + radius);
        ctx.lineTo(labelX + labelWidth, labelY + labelHeight - radius);
        ctx.quadraticCurveTo(labelX + labelWidth, labelY + labelHeight, labelX + labelWidth - radius, labelY + labelHeight);
        ctx.lineTo(labelX + radius, labelY + labelHeight);
        ctx.quadraticCurveTo(labelX, labelY + labelHeight, labelX, labelY + labelHeight - radius);
        ctx.lineTo(labelX, labelY + radius);
        ctx.quadraticCurveTo(labelX, labelY, labelX + radius, labelY);
        ctx.closePath();
        ctx.fill();
        
        // Draw label text with slight shadow for depth
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;
        ctx.fillText(label, labelX + padding, labelY + padding / 2);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
    });
    
    ctx.restore();
}

// MODIFIED: Enhanced processDetectionResults with train bounding boxes
function processDetectionResults(result) {
    
    if (isTransitioning) {
        console.log('Skipping detection processing during transition');
        return;
    }
    
    // Check if train is present from server response
    if (result.train_present !== undefined) {
        if (result.train_present !== isTrainPresent) {
            handleTrainStatusChange(result.train_present);
        }
    }
    
    const container = document.querySelector('.video-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    // Clear canvas first
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw train bounding boxes if train is present
    if (result.train_bboxes && result.train_bboxes.length > 0) {
        drawTrainBoundingBoxes(result.train_bboxes);
    }

    const scaling = getVideoScaling();
    ctx.save();
    ctx.translate(scaling.offsetX, scaling.offsetY);

    // If train is present, show train boxes but no person detections
    if (isTrainPresent || boardingModeActive) {
        // Reset stats to 0
        stats.yellowLineBreach = 0;
        stats.platformEdgeBreach = 0;
        stats.passengerCount = 0;
        
        // Update display
        document.getElementById('yellowLineBreach').textContent = '0';
        document.getElementById('platformEdgeBreach').textContent = '0';
        document.getElementById('passengerCount').textContent = '0';
        
        // Draw zones if enabled
        if (typeof drawZones === 'function') {
            drawZones();
        }
        
        return;
    }
    
    // Normal processing continues here when no train is present
    currentDetections = smoothDetections(result.detections || []);
    
    if (currentDetections.length === 0) {
        if (currentBreachState !== 'safe' && !boardingModeActive) {
            clearBreach();
        }
        
        stats.yellowLineBreach = 0;
        stats.platformEdgeBreach = 0;
        stats.passengerCount = 0;
        updateStatistics();
        return;
    }
    
    currentFrameStats = {
        yellowBreaches: 0,
        redBreaches: 0,
        passengers: 0
    };

    

    let hasWarningBreach = false;
    let hasDangerBreach = false;
    
    let currentBreachingPersons = {
        yellow: new Set(),
        red: new Set()
    };
    
    if (currentDetections.length > 0) {
        currentDetections.forEach(detection => {
            const x1 = detection.x1 * scaling.scaleX;
            const y1 = detection.y1 * scaling.scaleY;
            const x2 = detection.x2 * scaling.scaleX;
            const y2 = detection.y2 * scaling.scaleY;
            
            let boxColor = '#00ff00';
            let statusLabel = 'SAFE';
            
            if (!breachDurationTracking[detection.track_id]) {
                breachDurationTracking[detection.track_id] = {
                    yellowStartTime: null,
                    redStartTime: null,
                    yellowLogged: false,
                    redLogged: false
                };
            }
            
            const personTracking = breachDurationTracking[detection.track_id];
            
            if (!boardingModeActive) {
                if (detection.breach_type === 'danger') {
                    boxColor = '#ff4444';
                    statusLabel = 'DANGER';
                    currentFrameStats.redBreaches++;
                    hasDangerBreach = true;
                    currentBreachingPersons.red.add(detection.track_id);
                    
                    if (!personTracking.redStartTime) {
                        personTracking.redStartTime = Date.now();
                        console.log(`Person ${detection.track_id} entered red zone`);
                    }
                    
                    const redDuration = Date.now() - personTracking.redStartTime;
                    if (redDuration >= 4000 && !personTracking.redLogged) {
                        personTracking.redLogged = true;
                        const currentTime = new Date();
                        const timeString = currentTime.toTimeString().split(' ')[0];
                        addNewBreachEntry('red', timeString, 'Platform Edge');
                        
                        cumulativeBreachCounts.red++;
                        totalBreachCounts.red = cumulativeBreachCounts.red;
                        updateBreachChart();
                        
                        console.log(`Logged red zone breach for person ${detection.track_id} after 5 seconds`);
                    }
                    
                } else if (detection.breach_type === 'warning') {
                    boxColor = '#ffd700';
                    statusLabel = 'WARNING';
                    currentFrameStats.yellowBreaches++;
                    hasWarningBreach = true;
                    currentBreachingPersons.yellow.add(detection.track_id);
                    
                    if (!personTracking.yellowStartTime) {
                        personTracking.yellowStartTime = Date.now();
                        console.log(`Person ${detection.track_id} entered yellow zone`);
                    }
                    
                    const yellowDuration = Date.now() - personTracking.yellowStartTime;
                    if (yellowDuration >= 4000 && !personTracking.yellowLogged) {
                        personTracking.yellowLogged = true;
                        const currentTime = new Date();
                        const timeString = currentTime.toTimeString().split(' ')[0];
                        addNewBreachEntry('yellow', timeString, 'Yellow Line');
                        
                        cumulativeBreachCounts.yellow++;
                        totalBreachCounts.yellow = cumulativeBreachCounts.yellow;
                        updateBreachChart();
                        
                        console.log(`Logged yellow zone breach for person ${detection.track_id} after 5 seconds`);
                    }
                }
            } else {
                if (detection.breach_type === 'danger') {
                    boxColor = '#ff9999';
                    statusLabel = 'BOARDING';
                } else if (detection.breach_type === 'warning') {
                    boxColor = '#ffff99';
                    statusLabel = 'BOARDING';
                }
                
                personTracking.yellowStartTime = null;
                personTracking.redStartTime = null;
                personTracking.yellowLogged = false;
                personTracking.redLogged = false;
            }
            
            if (!detection.breach_type || detection.breach_type === 'safe') {
                if (personTracking.yellowStartTime) {
                    console.log(`Person ${detection.track_id} left yellow zone`);
                }
                if (personTracking.redStartTime) {
                    console.log(`Person ${detection.track_id} left red zone`);
                }
                
                personTracking.yellowStartTime = null;
                personTracking.redStartTime = null;
                personTracking.yellowLogged = false;
                personTracking.redLogged = false;
            }
            
            ctx.lineWidth = 3;
            ctx.strokeStyle = boxColor;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            
            let timeInZone = '';
            if (!boardingModeActive) {
                if (detection.breach_type === 'danger' && personTracking.redStartTime) {
                    const duration = Math.floor((Date.now() - personTracking.redStartTime) / 1000) + 1;
                    timeInZone = ` (${duration}s)`;
                } else if (detection.breach_type === 'warning' && personTracking.yellowStartTime) {
                    const duration = Math.floor((Date.now() - personTracking.yellowStartTime) / 1000) + 1;
                    timeInZone = ` (${duration}s)`;
                }
            }
            
            const trackLabel = detection.track_id ? `Person #${detection.track_id}` : 'Person';
            const confidencePercent = Math.round((detection.confidence || 0.9) * 100);
            const fullLabel = `Person (${confidencePercent}%) - ${statusLabel}${timeInZone}`;
            
            const fontSize = fullLabel.length > 40 ? 12 : 14;
            ctx.font = `bold ${fontSize}px Arial`;
            const metrics = ctx.measureText(fullLabel);
            
            const labelHeight = fontSize + 10;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x1, y1 - labelHeight - 5, metrics.width + 10, labelHeight);
            
            ctx.fillStyle = boxColor;
            ctx.fillText(fullLabel, x1 + 5, y1 - 8);
            
            if (detection.foot_position) {
                const footX = detection.foot_position[0] * scaling.scaleX;
                const footY = detection.foot_position[1] * scaling.scaleY;
                
                ctx.fillStyle = boxColor;
                ctx.beginPath();
                ctx.arc(footX, footY, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.strokeStyle = boxColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(footX - 10, footY);
                ctx.lineTo(footX + 10, footY);
                ctx.stroke();
                
                ctx.font = 'bold 10px Arial';
                ctx.fillStyle = 'white';
                ctx.fillText('F', footX - 3, footY + 3);
            }
        });

        currentFrameStats.passengers = currentDetections.length;
        
    }

    ctx.restore()

    Object.keys(breachDurationTracking).forEach(trackId => {
        const trackIdNum = parseInt(trackId);
        const detection = currentDetections.find(d => d.track_id === trackIdNum);
        
        if (!detection || !detection.breach_type || detection.breach_type === 'safe') {
            const tracking = breachDurationTracking[trackId];
            if (tracking.yellowStartTime || tracking.redStartTime) {
                console.log(`Person ${trackId} left breach zone - resetting their timers`);
                tracking.yellowStartTime = null;
                tracking.redStartTime = null;
                tracking.yellowLogged = false;
                tracking.redLogged = false;
            }
        }
    });
    
    if (typeof drawZones === 'function') {
        drawZones();
    }
    
    if (!boardingModeActive) {
        const noBreaches = !hasDangerBreach && !hasWarningBreach;
        
        if (noBreaches && currentBreachState !== 'safe') {
            console.log('No active breaches detected - clearing status');
            clearBreach();
        } else if (!noBreaches) {
            if (hasDangerBreach && hasWarningBreach) {
                if (currentBreachState !== 'both') {
                    simulateBothBreaches();
                }
            } else if (hasDangerBreach) {
                if (currentBreachState !== 'red' && currentBreachState !== 'both') {
                    simulatePlatformEdgeBreach();
                }
            } else if (hasWarningBreach) {
                if (currentBreachState !== 'yellow' && currentBreachState !== 'both') {
                    simulateYellowLineBreach();
                }
            }
        }
    }
    
    stats.yellowLineBreach = boardingModeActive ? 0 : currentFrameStats.yellowBreaches;
    stats.platformEdgeBreach = boardingModeActive ? 0 : currentFrameStats.redBreaches;
    stats.passengerCount = currentFrameStats.passengers;
    
    document.getElementById('yellowLineBreach').textContent = stats.yellowLineBreach;
    document.getElementById('platformEdgeBreach').textContent = stats.platformEdgeBreach;
    document.getElementById('passengerCount').textContent = stats.passengerCount;
}

async function resetTrackers(camera = null) {
    try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        currentDetections = [];
        
        const response = await fetch(`${API_BASE_URL}/reset_trackers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                camera: camera || currentCamera,
                reset_counter: true
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Trackers reset successfully');
            
            if (typeof detectionBuffer !== 'undefined') {
                detectionBuffer = {};
            }
        }
    } catch (error) {
        console.error('Error resetting trackers:', error);
    }
}

function createZoneCanvas() {
    const existingZoneCanvas = document.getElementById('zoneCanvas');
    if (existingZoneCanvas) return existingZoneCanvas;
    
    const zoneCanvas = document.createElement('canvas');
    zoneCanvas.id = 'zoneCanvas';
    zoneCanvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 3;
    `;
    
    const videoContainer = document.querySelector('.video-container');
    videoContainer.appendChild(zoneCanvas);
    
    return zoneCanvas;
}

function drawZones() {
    if (!showZones || !zoneData || !zoneData.zones) return;
    
    const zoneCanvas = document.getElementById('zoneCanvas') || createZoneCanvas();
    const zoneCtx = zoneCanvas.getContext('2d');
    
    // Make canvas match container size, not video size
    const container = document.querySelector('.video-container');
    zoneCanvas.width = container.clientWidth;
    zoneCanvas.height = container.clientHeight;
    
    const scaling = getVideoScaling();
    
    zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
    
    const zones = zoneData.zones;
    
    zoneCtx.save();
    
    // Apply the offset to match video positioning
    zoneCtx.translate(scaling.offsetX, scaling.offsetY);
    
    ['danger', 'warning', 'safe'].forEach(zoneType => {
        const color = zoneType === 'danger' ? '#ff0000' : 
                     zoneType === 'warning' ? '#ffff00' : '#00ff00';
        
        zoneCtx.fillStyle = color;
        zoneCtx.strokeStyle = color;
        zoneCtx.lineWidth = 3;
        zoneCtx.globalAlpha = 0.3;
        
        // Scale points based on video scaling
        const scaledPoints = zones[zoneType].map(point => [
            point[0] * scaling.scaleX,
            point[1] * scaling.scaleY
        ]);
        
        zoneCtx.beginPath();
        scaledPoints.forEach((point, i) => {
            if (i === 0) zoneCtx.moveTo(point[0], point[1]);
            else zoneCtx.lineTo(point[0], point[1]);
        });
        zoneCtx.closePath();
        zoneCtx.fill();
        
        zoneCtx.globalAlpha = 1;
        zoneCtx.beginPath();
        scaledPoints.forEach((point, i) => {
            if (i === 0) zoneCtx.moveTo(point[0], point[1]);
            else zoneCtx.lineTo(point[0], point[1]);
        });
        zoneCtx.closePath();
        zoneCtx.stroke();
    });
    
    zoneCtx.restore();
}

function addZoneVisualizationButton() {
    const existingBtn = document.querySelector('.zone-viz-btn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.innerHTML = '<i class="fas fa-map"></i> Show Zones';
    button.className = 'zone-viz-btn';
    button.style.cssText = `
        position: absolute;
        top: 50px;
        right: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 25;
        font-size: 14px;
        font-weight: bold;
        min-width: 120px;
    `;
    
    button.onclick = async () => {
        showZones = !showZones;
        
        if (showZones) {
            if (!zoneData) {
                try {
                    const response = await fetch(`${API_BASE_URL}/zones/${currentCamera}`);
                    const data = await response.json();
                    if (data.success) {
                        zoneData = data;
                        console.log('Zone data loaded:', zoneData);
                    } else {
                        console.error('Failed to load zones:', data.error);
                        showZones = false;
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching zones:', error);
                    showZones = false;
                    return;
                }
            }
            button.innerHTML = '<i class="fas fa-map"></i> Hide Zones';
            button.style.background = 'rgba(255, 0, 0, 0.8)';
            drawZones();
        } else {
            button.innerHTML = '<i class="fas fa-map"></i> Show Zones';
            button.style.background = 'rgba(0, 0, 0, 0.8)';
            const zoneCanvas = document.getElementById('zoneCanvas');
            if (zoneCanvas) {
                const zoneCtx = zoneCanvas.getContext('2d');
                zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
            }
        }
    };
    
    document.querySelector('.video-container').appendChild(button);
}

function getVideoScaling() {
    const container = document.querySelector('.video-container');
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    const videoWidth = videoPlayer.videoWidth;
    const videoHeight = videoPlayer.videoHeight;
    
    // Calculate the scale to cover the container (same as object-fit: cover)
    const containerAspect = containerWidth / containerHeight;
    const videoAspect = videoWidth / videoHeight;
    
    let scaleX, scaleY, offsetX = 0, offsetY = 0;
    
    if (containerAspect > videoAspect) {
        // Container is wider than video aspect - fit to width
        scaleX = containerWidth / videoWidth;
        scaleY = scaleX; // Maintain aspect ratio
        const scaledHeight = videoHeight * scaleY;
        offsetY = (containerHeight - scaledHeight) / 2;
    } else {
        // Container is taller than video aspect - fit to height
        scaleY = containerHeight / videoHeight;
        scaleX = scaleY; // Maintain aspect ratio
        const scaledWidth = videoWidth * scaleX;
        offsetX = (containerWidth - scaledWidth) / 2;
    }
    
    return {
        scaleX: scaleX,
        scaleY: scaleY,
        offsetX: offsetX,
        offsetY: offsetY,
        containerWidth: containerWidth,
        containerHeight: containerHeight,
        videoWidth: videoWidth,
        videoHeight: videoHeight
    };
}

function handleVideoLoad() {
    isTrainPresent = false;
    boardingModeActive = false;
    
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    
    const zoneCanvas = createZoneCanvas();
    if (zoneCanvas) {
        zoneCanvas.width = videoPlayer.videoWidth;
        zoneCanvas.height = videoPlayer.videoHeight;
    }
    
    if (!document.querySelector('.clear-video-btn')) {
        addClearVideoButton();
    }
    
    if (!document.querySelector('.zone-viz-btn')) {
        addZoneVisualizationButton();
    }
    
    startDetection();
}

const DETECTION_INTERVAL = 16;
const IMAGE_QUALITY = 1;
const MAX_IMAGE_SIZE = 1920;

async function detectFrame() {
    if (isProcessing || !videoPlayer.src || videoPlayer.paused || isTransitioning) return;
    
    isProcessing = true;
    
    try {
        if (isTransitioning) {
            isProcessing = false;
            return;
        }
        
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = videoPlayer.videoWidth;
        tempCanvas.height = videoPlayer.videoHeight;
        tempCtx.drawImage(videoPlayer, 0, 0, videoPlayer.videoWidth, videoPlayer.videoHeight);
        
        const blob = await new Promise(resolve => 
            tempCanvas.toBlob(resolve, 'image/jpeg', 0.8)
        );
        
        if (isTransitioning) {
            isProcessing = false;
            return;
        }
        
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');
        formData.append('camera', currentCamera);
        
        const response = await fetch(`${API_BASE_URL}/detect`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success && !isTransitioning) {
            processDetectionResults(result);
        }
    } catch (error) {
        if (!isTransitioning) {
            console.error('Detection error:', error);
        }
    } finally {
        isProcessing = false;
    }
}

function startDetection() {
    stopDetection();
    
    function detectLoop() {
        if (!videoPlayer.paused && !videoPlayer.ended && !isProcessing) {
            detectFrame();
        }
        detectionInterval = requestAnimationFrame(detectLoop);
    }
    
    detectionInterval = requestAnimationFrame(detectLoop);
}

function stopDetection() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
    
    isProcessing = false;
}

let lastSeekTime = 0;
videoPlayer.addEventListener('seeking', function() {
    console.log('Video seeking detected');
    
    isTransitioning = true;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    currentDetections = [];
    
    if (typeof detectionBuffer !== 'undefined') {
        detectionBuffer = {};
    }
    
    stopDetection();
    resetTrackers(currentCamera);
    
    lastSeekTime = videoPlayer.currentTime;
});

videoPlayer.addEventListener('seeked', function() {
    console.log('Seek completed');
    
    setTimeout(() => {
        isTransitioning = false;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (videoPlayer.paused) {
            const statusBar = document.getElementById('statusBar');
            if (statusBar.classList.contains('yellow-breach') || 
                statusBar.classList.contains('red-breach') || 
                statusBar.classList.contains('both-breach')) {
                clearBreach();
            }
            
            stats.passengerCount = 0;
            updateStatistics();
        } else {
            startDetection();
        }
    }, 100);
});

videoPlayer.addEventListener('play', () => {
    console.log('Video playing, starting detection...');
    startDetection();
    
    if (!trainStatusInterval) {
        startTrainStatusMonitoring();
    }
});

videoPlayer.addEventListener('pause', () => {
    console.log('Video paused, stopping detection...');
    stopDetection();
    
    stopTrainStatusMonitoring();
});

videoPlayer.addEventListener('ended', () => {
    console.log('Video ended, stopping detection...');
    stopDetection();
    
    stopTrainStatusMonitoring();
});

async function processImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/detect`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    processDetectionResults(result);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    } catch (error) {
        console.error('Error processing image:', error);
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.type.startsWith('video/')) {
            loadVideo(file);
        } else if (file.type.startsWith('image/')) {
            uploadArea.classList.add('hidden');
            processImage(file);
        }
    }
    
    e.target.value = '';
}

function updateStatistics() {
    yellowLineBreachEl.textContent = stats.yellowLineBreach;
    platformEdgeBreachEl.textContent = stats.platformEdgeBreach;
    passengerCountEl.textContent = stats.passengerCount;
}

const originalUpdateBreachChart = updateBreachChart;
updateBreachChart = function() {
    originalUpdateBreachChart();
    
    if (modalBreachChart) {
        updateModalChart();
    }
};

function updateBreachChart() {
    const total = totalBreachCounts.yellow + totalBreachCounts.red;
    const breakdownSection = document.querySelector('.breach-breakdown-section');
    
    if (total === 0) {
        breakdownSection.classList.add('no-data');
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

function makeBreachLogClickable() {
    const breachLogSection = document.querySelector('.breach-log-section');
    if (breachLogSection) {
        breachLogSection.style.cursor = 'pointer';
        
        breachLogSection.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            this.style.transition = 'all 0.3s ease';
        });
        
        breachLogSection.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
        
        breachLogSection.addEventListener('click', function(e) {
            if (!e.target.closest('.log-entry')) {
                saveBreachLogToStorage();
                openBreachLogModal();
            }
        });
    }
}

function openBreachLogModal() {
    const modal = document.getElementById('breachLogModal');
    modal.style.display = 'flex';
}

function closeBreachLogModal() {
    const modal = document.getElementById('breachLogModal');
    modal.style.display = 'none';
    
    refreshBreachLogFromStorage();
}

function openBreachChartModal() {
    const modal = document.getElementById('breachChartModal');
    modal.style.display = 'flex';
    
    if (!modalBreachChart) {
        initializeModalChart();
    }
    
    updateModalChart();
}

function closeBreachChartModal() {
    const modal = document.getElementById('breachChartModal');
    modal.style.display = 'none';
}

function updateModalChart() {
    if (!modalBreachChart) return;
    
    const total = totalBreachCounts.yellow + totalBreachCounts.red;
    const modalBody = document.querySelector('#breachChartModal .modal-body');
    
    if (total === 0) {
        modalBody.classList.add('no-data');
        
        modalBreachChart.data.datasets[0].data = [50, 50];
        document.getElementById('modalYellowPercentage').textContent = '0%';
        document.getElementById('modalRedPercentage').textContent = '0%';
    } else {
        modalBody.classList.remove('no-data');
        
        const yellowPercentage = Math.round((totalBreachCounts.yellow / total) * 100);
        const redPercentage = Math.round((totalBreachCounts.red / total) * 100);
        
        modalBreachChart.data.datasets[0].data = [totalBreachCounts.yellow, totalBreachCounts.red];
        
        document.getElementById('modalYellowPercentage').textContent = `${yellowPercentage}%`;
        document.getElementById('modalRedPercentage').textContent = `${redPercentage}%`;
    }
    
    modalBreachChart.update();
}

function exportChartFromModal() {
    if (!modalBreachChart) {
        alert('Chart not initialized');
        return;
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const originalCanvas = modalBreachChart.canvas;
    
    tempCanvas.width = 800;
    tempCanvas.height = 600;
    
    tempCtx.fillStyle = '#ffffff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    tempCtx.fillStyle = '#1e3c72';
    tempCtx.font = 'bold 32px Arial';
    tempCtx.textAlign = 'center';
    tempCtx.fillText('BREACH BREAKDOWN CHART', tempCanvas.width / 2, 50);
    
    const chartSize = 400;
    const chartX = (tempCanvas.width - chartSize) / 2;
    const chartY = 80;
    
    tempCtx.drawImage(originalCanvas, 
        0, 0, originalCanvas.width, originalCanvas.height,
        chartX, chartY, chartSize, chartSize
    );
    
    const legendY = chartY + chartSize + 40;
    const total = totalBreachCounts.yellow + totalBreachCounts.red;
    const yellowPercentage = total > 0 ? Math.round((totalBreachCounts.yellow / total) * 100) : 0;
    const redPercentage = total > 0 ? Math.round((totalBreachCounts.red / total) * 100) : 0;
    
    tempCtx.fillStyle = '#FFD700';
    tempCtx.fillRect(250, legendY, 20, 20);
    tempCtx.fillStyle = '#1e3c72';
    tempCtx.font = '18px Arial';
    tempCtx.textAlign = 'left';
    tempCtx.fillText('Yellow Line ' + yellowPercentage + '%', 280, legendY + 15);
    
    tempCtx.fillStyle = '#FF4444';
    tempCtx.fillRect(450, legendY, 20, 20);
    tempCtx.fillStyle = '#1e3c72';
    tempCtx.fillText('Platform Edge ' + redPercentage + '%', 480, legendY + 15);
    
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `BreachBreakdownChart_${timestamp}.png`;
    
    tempCanvas.toBlob(function(blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 'image/png');
}

let modalBreachChart;

function makeBreachChartClickable() {
    const breachBreakdownSection = document.querySelector('.breach-breakdown-section');
    if (breachBreakdownSection) {
        breachBreakdownSection.style.cursor = 'pointer';
        
        breachBreakdownSection.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
            this.style.transition = 'all 0.3s ease';
        });
        
        breachBreakdownSection.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
        
        breachBreakdownSection.addEventListener('click', function() {
            openBreachChartModal();
        });
    }
}

let currentCamera = 'cam1';

function setupEventListeners() {
    uploadArea.addEventListener('click', () => videoInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('drop', handleDrop);
    videoInput.addEventListener('change', handleFileSelect);
    
    videoPlayer.addEventListener('loadedmetadata', handleVideoLoad);
    
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', async (e) => {
            currentCamera = e.target.value;
            console.log('Camera changed to:', currentCamera);
            
            zoneData = null;
            if (showZones) {
                try {
                    const response = await fetch(`${API_BASE_URL}/zones/${currentCamera}`);
                    zoneData = await response.json();
                } catch (error) {
                    console.error('Error fetching zones:', error);
                }
            }
        });
    }
}

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
    if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoPlayer.src);
    }
    
    const url = URL.createObjectURL(file);
    videoPlayer.src = url;
    
    uploadArea.classList.add('hidden');
    
    resetTrackers('all');
    
    document.querySelector('.video-container').classList.add('has-video');
    
    videoPlayer.load();
}

function showUploadArea() {
    uploadArea.classList.remove('hidden');
    
    uploadArea.style.pointerEvents = 'auto';
    uploadArea.style.display = 'flex';
    
    const videoContainer = document.querySelector('.video-container');
    videoContainer.classList.remove('has-video');
    videoContainer.classList.remove('playing');
    
    videoPlayer.style.display = '';
    
    const videoInput = document.getElementById('videoInput');
    if (videoInput) {
        videoInput.value = '';
    }
}

async function clearVideo() {
    isTransitioning = true;
    
    stopDetection();
    isProcessing = false;
    
    stopTrainStatusMonitoring();
    
    videoPlayer.pause();
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (breachTimerInterval) {
        clearInterval(breachTimerInterval);
        breachTimerInterval = null;
    }
    
    isTrainPresent = false;
    boardingModeActive = false;
    
    const trainControl = document.querySelector('.train-status-control');
    if (trainControl) {
        trainControl.remove();
    }
    
    removeBoardingIndicator();

    clearAllBreachTimers();
    
    breachTimerStartTime = null;
    safeTimerStartTime = Date.now();
    currentBreachState = 'safe';

    if (videoPlayer.src && videoPlayer.src.startsWith('blob:')) {
        URL.revokeObjectURL(videoPlayer.src);
    }
    
    videoPlayer.removeAttribute('src');
    videoPlayer.load();
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = canvas.width;
    
    localStorage.removeItem('breachLogData');

    const zoneCanvas = document.getElementById('zoneCanvas');
    if (zoneCanvas) {
        const zoneCtx = zoneCanvas.getContext('2d');
        zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
        zoneCanvas.width = zoneCanvas.width;
    }
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    const timestampEl = document.getElementById('timestamp');
    
    statusBar.classList.remove('yellow-breach', 'red-breach', 'both-breach');
    
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.safe}" alt="Safe" class="status-icon-large safe-icon">
        </div>
        <span class="breach-text">No breach detected</span>
    `;
    
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.alertDisabled}" alt="Alert Disabled" style="width: 24px; height: 24px; object-fit: contain;">
        </div>
        <span class="alert-text-disabled">Alert: Disabled</span>
    `;
    
    timestampEl.textContent = 'Safe for: 0s';
    
    cumulativeBreachCounts = {
        yellow: 0,
        red: 0
    };
    
    breachTracking = {};
    
    breachDurationTracking = {};

    stats = {
        yellowLineBreach: 0,
        platformEdgeBreach: 0,
        passengerCount: 0
    };
    
    currentFrameStats = {
        yellowBreaches: 0,
        redBreaches: 0,
        passengers: 0
    };
    
    document.getElementById('yellowLineBreach').textContent = '0';
    document.getElementById('platformEdgeBreach').textContent = '0';
    document.getElementById('passengerCount').textContent = '0';
    
    totalBreachCounts = {
        yellow: 0,
        red: 0
    };
    
    if (breachChart) {
        breachChart.data.datasets[0].data = [50, 50];
        breachChart.update();
        document.querySelector('.legend-item:nth-child(1) span:last-child').textContent = 'Yellow Line 0%';
        document.querySelector('.legend-item:nth-child(2) span:last-child').textContent = 'Platform Edge 0%';
        document.querySelector('.breach-breakdown-section').classList.add('no-data');
    }
    
    const breachLog = document.getElementById('breachLog');
    breachLog.innerHTML = '<div class="no-breaches">No breaches yet</div>';
    
    currentDetections = [];
    detectionBuffer = {};
    
    await resetTrackers('all');
    
    showZones = false;
    zoneData = null;
    
    const elementsToRemove = [
        '.clear-video-btn',
        '.zone-viz-btn',
        '.train-status-control',
        '.alarm-controls'
    ];

    const videoInput = document.getElementById('videoInput');
    if (videoInput) {
        videoInput.value = '';
    }
    
    elementsToRemove.forEach(selector => {
        const element = document.querySelector(selector);
        if (element) element.remove();
    });
    
    showUploadArea();
    
    document.querySelector('.video-container').classList.remove('has-video');
    document.querySelector('.video-container').classList.remove('playing');
    
    if (!breachTimerInterval) {
        breachTimerInterval = setInterval(updateBreachTimerDisplay, 1000);
    }
    
    setTimeout(() => {
        isTransitioning = false;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        updateStatistics();
        updateBreachTimerDisplay();
    }, 200);
}

const originalClearVideo = clearVideo;
clearVideo = async function() {
    isTrainPresent = false;
    boardingModeActive = false;
    
    removeBoardingIndicator();
    
    await originalClearVideo();
};

const originalResetSystem = resetSystem;
resetSystem = async function() {
    isTrainPresent = false;
    boardingModeActive = false;
    
    const trainToggle = document.getElementById('trainPresentToggle');
    if (trainToggle) {
        trainToggle.checked = false;
    }
    
    removeBoardingIndicator();
    
    await originalResetSystem();
};

document.addEventListener('keydown', function(e) {
    if (e.key === 't' || e.key === 'T') {
        const trainToggle = document.getElementById('trainPresentToggle');
        if (trainToggle && !e.target.matches('input, textarea')) {
            trainToggle.checked = !trainToggle.checked;
            trainToggle.dispatchEvent(new Event('change'));
        }
    }
});

function addClearVideoButton() {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'clear-video-btn';
    clearBtn.innerHTML = '<i class="fas fa-times"></i> Clear Video';
    clearBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 15;
        font-size: 14px;
    `;
    clearBtn.onclick = clearVideo;
    
    document.querySelector('.video-container').appendChild(clearBtn);
    
    addTrainStatusControl();
    
    createCameraSelector();
}

function addTrainStatusControl() {
    const existingControl = document.querySelector('.train-status-control');
    if (existingControl) existingControl.remove();
    
    const trainControl = document.createElement('div');
    trainControl.className = 'train-status-control';
    trainControl.innerHTML = `
        <label class="toggle-switch">
            <input type="checkbox" id="trainPresentToggle">
            <span class="toggle-slider"></span>
        </label>
        <span class="train-status-label">Train is Boarding</span>
        <i class="fas fa-train train-icon"></i>
    `;
    
    document.querySelector('.video-container').appendChild(trainControl);
    
    initializeTrainToggle();
}

function createCameraSelector() {
    const existingSelector = document.querySelector('.camera-selector');
    if (existingSelector) existingSelector.remove();
    
    const selector = document.createElement('div');
    selector.className = 'camera-selector';
    selector.innerHTML = `
        <label for="cameraSelect">Camera View:</label>
        <select id="cameraSelect" class="camera-dropdown">
            <option value="cam1">Camera 1 - Platform A</option>
            <option value="cam2">Camera 2 - Platform B</option>
            <option value="cam3">Camera 3 - Platform C</option>
        </select>
    `;
    
    document.querySelector('.video-container').appendChild(selector);
    
    const cameraSelect = selector.querySelector('#cameraSelect');
    if (currentCamera) {
        cameraSelect.value = currentCamera;
    }
    
    cameraSelect.addEventListener('change', async (e) => {
        currentCamera = e.target.value;
        console.log('Camera changed to:', currentCamera);
        
        await resetTrackers(currentCamera);

        zoneData = null;
        if (showZones) {
            try {
                const response = await fetch(`${API_BASE_URL}/zones/${currentCamera}`);
                zoneData = await response.json();
                drawZones();
            } catch (error) {
                console.error('Error fetching zones:', error);
            }
        }
    });
}

videoPlayer.addEventListener('loadeddata', function() {
    isTransitioning = true;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    currentDetections = [];
    
    resetTrackers(currentCamera).then(() => {
        setTimeout(() => {
            isTransitioning = false;
            
            const existingClearBtn = document.querySelector('.clear-video-btn');
            const existingCameraSelector = document.querySelector('.camera-selector');
            const existingZoneBtn = document.querySelector('.zone-viz-btn');
            
            if (existingClearBtn) existingClearBtn.remove();
            if (existingCameraSelector) existingCameraSelector.remove();
            if (existingZoneBtn) existingZoneBtn.remove();
            
            addClearVideoButton();
            addZoneVisualizationButton();
        }, 200);
    });
});

function loadExistingBreachLog() {
    const breachLog = document.getElementById('breachLog');
    if (breachLog) {
        breachLog.innerHTML = '<div class="no-breaches">No breaches yet</div>';
    }
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

let totalBreachCounts = {
    yellow: 0,
    red: 0
};

function initializeChart() {
    const ctx = document.getElementById('breachChart').getContext('2d');
    breachChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Yellow Line', 'Platform Edge'],
            datasets: [{
                data: [50, 50],
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
    
    document.querySelector('.legend-item:nth-child(1) span:last-child').textContent = 'Yellow Line 0%';
    document.querySelector('.legend-item:nth-child(2) span:last-child').textContent = 'Platform Edge 0%';
}

function initializeModalChart() {
    const ctx = document.getElementById('modalBreachChart').getContext('2d');
    modalBreachChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Yellow Line', 'Platform Edge'],
            datasets: [{
                data: [50, 50],
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
}

// Hide native video controls fullscreen button and add custom one
videoPlayer.addEventListener('loadedmetadata', function() {
    // Add custom fullscreen button
    if (!document.querySelector('.custom-fullscreen-btn')) {
        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 'custom-fullscreen-btn';
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        fullscreenBtn.style.cssText = `
            position: absolute;
            bottom: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            z-index: 30;
            font-size: 16px;
        `;
        
        fullscreenBtn.onclick = function() {
            const container = document.querySelector('.video-container');
            if (!document.fullscreenElement) {
                container.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        };
        
        document.querySelector('.video-container').appendChild(fullscreenBtn);
    }
});

// Add CSS to hide the native fullscreen button
const style = document.createElement('style');
style.textContent = `
    /* Hide native fullscreen button */
    video::-webkit-media-controls-fullscreen-button {
        display: none !important;
    }
    
    /* Ensure canvas stays visible in fullscreen */
    .video-container:fullscreen #detectionCanvas,
    .video-container:-webkit-full-screen #detectionCanvas {
        display: block !important;
        z-index: 1000000 !important;
    }
`;
document.head.appendChild(style);

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        videoPlayer.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function updateTimestamp() {
    updateBreachTimerDisplay();
}

function clearBreach() {
    console.log('Clearing breach status...');
    
    const wasInBreach = currentBreachState !== 'safe';
    
    currentBreachState = 'safe';
    breachConfirmed = false;
    breachConfirmationTime = null;
    breachTimerStartTime = null;
    
    clearAllBreachTimers();
    stopAllAlarms();
    
    const statusBar = document.getElementById('statusBar');
    const breachStatus = document.getElementById('breachStatus');
    const alertStatusItem = document.getElementById('alertStatusItem');
    
    statusBar.classList.remove('yellow-breach', 'red-breach', 'both-breach');
    statusBar.className = statusBar.className.replace(/\s*(yellow|red|both)-breach/g, '');
    
    breachStatus.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.safe}" alt="Safe" class="status-icon-large safe-icon">
        </div>
        <span class="breach-text">No breach detected</span>
    `;
    
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <img src="${ICONS.alertDisabled}" alt="Alert Disabled" style="width: 24px; height: 24px; object-fit: contain;">
        </div>
        <span class="alert-text-disabled">Alert: Disabled</span>
    `;
    
    if (wasInBreach) {
        safeTimerStartTime = Date.now();
        if (!breachTimerInterval) {
            breachTimerInterval = setInterval(updateBreachTimerDisplay, 1000);
        }
    }
    
    updateBreachTimerDisplay();
    updateStatistics();
}

function simulateYellowLineBreach() {
    console.log('Yellow line breach detected!');
    
    const stateChanged = currentBreachState !== 'yellow';
    currentBreachState = 'yellow';
    
    if (stateChanged) {
        startBreachTimer('yellow');
        startBreachTimerDisplay();
    }
    
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
    
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <i class="fas fa-bell alert-icon-enabled" style="color: #FFC107; font-size: 24px;"></i>
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    updateStatistics();
}

function simulatePlatformEdgeBreach() {
    console.log('Platform edge breach detected!');
    
    const stateChanged = currentBreachState !== 'red';
    currentBreachState = 'red';
    
    if (stateChanged) {
        startBreachTimer('red');
        startBreachTimerDisplay();
    }
    
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
    
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <i class="fas fa-bell alert-icon-enabled" style="color: #f44336; font-size: 24px;"></i>
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    updateStatistics();
}

function simulateBothBreaches() {
    console.log('Both breaches detected!');
    
    const stateChanged = currentBreachState !== 'both';
    currentBreachState = 'both';
    
    if (stateChanged) {
        startBreachTimer('both');
        startBreachTimerDisplay();
    }
    
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
    
    alertStatusItem.innerHTML = `
        <div class="icon-wrapper">
            <i class="fas fa-bell alert-icon-enabled" style="color: #FF5722; font-size: 24px;"></i>
        </div>
        <span class="alert-text-enabled">Alert: Enabled</span>
    `;
    
    updateStatistics();
}

function loadExistingBreachLog() {
    const breachLog = document.getElementById('breachLog');
    if (breachLog) {
        breachLog.innerHTML = '<div class="no-breaches">No breaches yet</div>';
    }
    
    cumulativeBreachCounts = {
        yellow: 0,
        red: 0
    };
}

function saveBreachLogToStorage() {
    const breachEntries = [];
    const logEntries = document.querySelectorAll('.breach-log .log-entry');
    
    logEntries.forEach(entry => {
        const time = entry.querySelector('.log-time').textContent;
        const location = entry.querySelector('.log-location').textContent;
        const isYellow = entry.querySelector('.log-dot.yellow') !== null;
        
        breachEntries.push({
            time: time,
            type: location,
            status: isYellow ? 'warning' : 'danger',
            fullType: location === 'Yellow Line' ? 'Yellow Line Breach' : 'Platform Edge Breach'
        });
    });
    
    localStorage.setItem('breachLogData', JSON.stringify(breachEntries));
}

function addNewBreachEntry(type, time, location) {
    const noBreachesMsg = breachLog.querySelector('.no-breaches');
    if (noBreachesMsg) {
        noBreachesMsg.remove();
    }
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.style.opacity = '0';
    entry.innerHTML = `
        <span class="log-dot ${type}"></span>
        <span class="log-time">${time}</span>
        <span class="log-location">${location}</span>
    `;
    
    breachLog.insertBefore(entry, breachLog.firstChild);
    
    setTimeout(() => {
        entry.style.transition = 'opacity 0.3s ease';
        entry.style.opacity = '1';
    }, 10);
    
    while (breachLog.children.length > 10) {
        breachLog.removeChild(breachLog.lastChild);
    }
    
    saveBreachLogToStorage();
    
    logBreachToServer(type, location);
}

async function logBreachToServer(type, location) {
    try {
        await fetch(`${API_BASE_URL}/log_breach`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type: type === 'yellow' ? 'yellow_line' : 'platform_edge',
                location: location,
                timestamp: new Date().toISOString()
            })
        });
    } catch (error) {
        console.error('Error logging breach:', error);
    }
}

async function resetSystem() {
    try {
        currentBreachState = 'safe';
        breachTimerStartTime = null;
        safeTimerStartTime = Date.now();
        
        if (!breachTimerInterval) {
            breachTimerInterval = setInterval(updateBreachTimerDisplay, 1000);
        }
        
        await fetch(`${API_BASE_URL}/stats/reset`, {
            method: 'POST'
        });
        
        await fetch(`${API_BASE_URL}/reset_trackers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                camera: 'all',
                reset_counter: true
            })
        });
        
        cumulativeBreachCounts = {
            yellow: 0,
            red: 0
        };
        
        breachTracking = {};

        breachDurationTracking = {};
        
        stats = {
            yellowLineBreach: 0,
            platformEdgeBreach: 0,
            passengerCount: 0
        };
        
        totalBreachCounts = {
            yellow: 0,
            red: 0
        };
        
        loadExistingBreachLog();
        
        updateStatistics();
        updateBreachChart();
        
        console.log('System reset complete');
        
    } catch (error) {
        console.error('Error resetting system:', error);
    }
}

function showServerStatus(isConnected) {
    const statusIndicator = document.createElement('div');
    statusIndicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 10px 20px;
        background: ${isConnected ? '#4CAF50' : '#f44336'};
        color: white;
        border-radius: 5px;
        font-size: 14px;
        z-index: 1000;
    `;
    statusIndicator.textContent = isConnected ? 
        'Detection Server Connected' : 
        'Detection Server Offline - Demo Mode';
    
    document.body.appendChild(statusIndicator);
    
    setTimeout(() => {
        statusIndicator.remove();
    }, 3000);
}

function initializeTrainToggle() {
    const trainToggle = document.getElementById('trainPresentToggle');
    if (trainToggle) {
        trainToggle.addEventListener('change', function(e) {
            const newTrainStatus = e.target.checked;
            
            if (newTrainStatus !== isTrainPresent) {
                isTrainPresent = newTrainStatus;
                boardingModeActive = newTrainStatus;
                
                const trainControl = document.querySelector('.train-status-control');
                
                if (newTrainStatus) {
                    if (trainControl) {
                        trainControl.classList.add('active');
                    }
                    
                    activateBoardingMode();
                    
                    console.log('[MANUAL] Train at platform - Boarding mode activated');
                } else {
                    if (trainControl) {
                        trainControl.classList.remove('active');
                    }
                    removeBoardingIndicator();
                    
                    console.log('[MANUAL] Train departed - Normal operation resumed');
                }
            }
        });
    }
}

function activateBoardingMode() {
    currentBreachState = 'safe';
    
    clearAllBreachTimers();
    stopAllAlarms();
    
    addBoardingIndicator();
    
    console.log('Boarding mode activated - detection paused, UI maintains current state');
}

function addBoardingIndicator() {
    const statusBar = document.getElementById('statusBar');
    statusBar.classList.add('boarding-mode');
    
    let indicator = document.querySelector('.boarding-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'boarding-indicator';
        indicator.innerHTML = `
            <i class="fas fa-user-clock"></i>
            <span>Boarding Mode - Breach Detection Paused</span>
        `;
        statusBar.appendChild(indicator);
    }
    indicator.classList.add('active');
}

function removeBoardingIndicator() {
    const statusBar = document.getElementById('statusBar');
    statusBar.classList.remove('boarding-mode');
    
    const indicator = document.querySelector('.boarding-indicator');
    if (indicator) {
        indicator.classList.remove('active');
    }
}

window.addEventListener('load', async () => {
    const isConnected = await checkServerHealth();
    showServerStatus(isConnected);
});

function showFAQ() {
    window.location.href = 'faq.html';
}

function showHelp() {
    window.location.href = 'help.html';
}

// Add to script.js
function openPredictionModal() {
    const modal = document.getElementById('predictionModal');
    modal.style.display = 'flex';
    
    // Load predictions when modal opens
    loadCrowdPredictions();
    
    // Set up refresh interval for modal
    window.predictionInterval = setInterval(loadCrowdPredictions, 10000);
}

function closePredictionModal() {
    const modal = document.getElementById('predictionModal');
    modal.style.display = 'none';
    
    // Clear interval when closing
    if (window.predictionInterval) {
        clearInterval(window.predictionInterval);
    }
}

// Update the goToPrediction function
function goToPrediction() {
    // Instead of navigating, open modal
    openPredictionModal();
}

function goToDashboard() {
    window.location.href = 'index.html';
}

async function loadCrowdPredictions() {
    try {
        const response = await fetch(`${API_BASE_URL}/predict_crowding`);
        const data = await response.json();
        
        if (data.success) {
            updatePredictionDisplay(data);
        }
    } catch (error) {
        console.error('Error loading predictions:', error);
    }
}

function updatePredictionDisplay(data) {
    // Update current status
    const current = data.current;
    const predicted = data.predicted;
    
    // Update percentage and status
    const percentageEl = document.querySelector('.percentage');
    if (percentageEl) {
        percentageEl.textContent = current.percentage + '%';
    }
    
    const statusEl = document.querySelector('.crowd-status');
    if (statusEl) {
        statusEl.textContent = current.level + ' Crowd Density';
    }
    
    // Update icon based on level
    const iconMap = {
        'Low': 'assets/icons/green_low.png',
        'Moderate': 'assets/icons/yellow_moderate.png',
        'High': 'assets/icons/red_high.png',
        'Critical': 'assets/icons/red_high.png',
        'OVERCROWDED': 'assets/icons/red_high.png'
    };
    
    const crowdImage = document.querySelector('.crowd-image');
    if (crowdImage) {
        crowdImage.src = iconMap[current.level] || 'assets/icons/green_low.png';
    }
    
    // Update hourly forecast - generate predictions for next 4 hours
    updateHourlyForecast(current.percentage);
}

function updateHourlyForecast(currentPercentage) {
    const forecastCards = document.querySelectorAll('.forecast-card');
    const timeSlots = document.querySelectorAll('.time-slot');
    
    // Simple prediction logic - you can make this more sophisticated
    const currentHour = new Date().getHours();
    
    for (let i = 0; i < 4; i++) {
        const futureHour = (currentHour + i + 1) % 24;
        const hourLabel = futureHour === 0 ? '12 AM' : 
                         futureHour < 12 ? `${futureHour} AM` : 
                         futureHour === 12 ? '12 PM' : 
                         `${futureHour - 12} PM`;
        
        // Predict based on time of day patterns
        let predictedPercentage = currentPercentage;
        if ((futureHour >= 7 && futureHour <= 9) || (futureHour >= 17 && futureHour <= 19)) {
            predictedPercentage = Math.min(90, currentPercentage + 30); // Rush hour
        } else if (futureHour >= 22 || futureHour <= 5) {
            predictedPercentage = Math.max(10, currentPercentage - 20); // Late night
        }
        
        const level = predictedPercentage < 40 ? 'low' : 
                     predictedPercentage < 70 ? 'moderate' : 'high';
        
        // Update forecast card
        if (forecastCards[i]) {
            forecastCards[i].className = `forecast-card ${level}`;
            forecastCards[i].innerHTML = `
                <div class="time">${hourLabel}</div>
                <div class="percentage">${Math.round(predictedPercentage)}%</div>
                <div class="density">${level.charAt(0).toUpperCase() + level.slice(1)}</div>
            `;
        }
        
        // Update time slot
        if (timeSlots[i]) {
            timeSlots[i].className = `time-slot ${level}`;
            const timeSpan = timeSlots[i].querySelector('.time');
            const densityLabel = timeSlots[i].querySelector('.density-label');
            const icon = timeSlots[i].querySelector('img');
            
            if (timeSpan) timeSpan.textContent = hourLabel;
            if (densityLabel) densityLabel.textContent = level.charAt(0).toUpperCase() + level.slice(1);
            if (icon) {
                const iconMap = {
                    'low': 'assets/icons/green_low.png',
                    'moderate': 'assets/icons/yellow_moderate.png',
                    'high': 'assets/icons/red_high.png'
                };
                icon.src = iconMap[level];
            }
        }
    }
}

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

window.runBreachDemo = function() {
    console.log('Starting breach demo...');
    
    setTimeout(() => {
        simulateYellowLineBreach();
    }, 2000);
    
    setTimeout(() => {
        clearBreach();
    }, 5000);
    
    setTimeout(() => {
        simulatePlatformEdgeBreach();
    }, 7000);
    
    setTimeout(() => {
        clearBreach();
    }, 10000);
    
    setTimeout(() => {
        simulateBothBreaches();
    }, 12000);
    
    setTimeout(() => {
        clearBreach();
    }, 15000);
};

window.testBreach = function() {
    simulateBreach();
};