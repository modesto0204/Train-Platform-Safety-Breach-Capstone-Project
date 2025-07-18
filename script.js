<<<<<<< HEAD
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

let showZones = false;
let zoneData = null;

document.addEventListener('DOMContentLoaded', async function() {
    initializeChart();
    setupEventListeners();
    updateTimestamp();
    loadExistingBreachLog();
    updateBreachChart();
    
    // Check if server is running
    const serverRunning = await checkServerHealth();
    if (serverRunning) {
        console.log('Detection server is running!');
        // Fetch initial stats
        await fetchStats();
    } else {
        console.warn('Detection server is not running. Using demo mode.');
        // Run demo after a delay if server is not available
        setTimeout(() => {
            runBreachDemo();
        }, 1000);
    }
    
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
});


const ICONS = {
    safe: 'assets/icons/safe_icon.png',
    yellowWarning: 'assets/icons/yellowwarning_icon.png',
    redWarning: 'assets/icons/redwarning_icon.png',
    yellowAlert: 'assets/icons/yellowalert_icon.png',
    redAlert: 'assets/icons/redalert_icon.png',
    alertDisabled: 'assets/icons/alert_disabled_icon.png' // You might need a disabled state icon
};

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
        
        // Only update chart data, not the live display
        totalBreachCounts.yellow = data.breach_counts?.warning || 0;
        totalBreachCounts.red = data.breach_counts?.danger || 0;
        updateBreachChart();
        
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

let currentFrameStats = {
    yellowBreaches: 0,
    redBreaches: 0,
    passengers: 0
};

let currentDetections = [];

// Update the processDetectionResults function to actually draw boxes
function processDetectionResults(result) {
    console.log('Processing detections:', result.detections);
    
    currentDetections = result.detections || [];
    
    currentFrameStats = {
        yellowBreaches: 0,
        redBreaches: 0,
        passengers: 0
    };

    // Get current scaling
    const scaling = window.videoScaling || { scaleX: 1, scaleY: 1 };
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let hasWarningBreach = false;
    let hasDangerBreach = false;
    
    if (currentDetections.length > 0) {
        currentDetections.forEach(detection => {
            // Scale coordinates from natural size to display size
            const x1 = detection.x1 * scaling.scaleX;
            const y1 = detection.y1 * scaling.scaleY;
            const x2 = detection.x2 * scaling.scaleX;
            const y2 = detection.y2 * scaling.scaleY;
            
            // Determine color and label
            let boxColor = '#00ff00';
            let statusLabel = 'SAFE';
            
            if (detection.breach_type === 'danger') {
                boxColor = '#ff4444';
                statusLabel = 'DANGER';
                currentFrameStats.redBreaches++;
                hasDangerBreach = true;
            } else if (detection.breach_type === 'warning') {
                boxColor = '#ffd700';
                statusLabel = 'WARNING';
                currentFrameStats.yellowBreaches++;
                hasWarningBreach = true;
            }
            
            // Draw bounding box
            ctx.lineWidth = 3;
            ctx.strokeStyle = boxColor;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            
            // Create label with track ID and breach count
            const trackLabel = detection.track_id ? `Person #${detection.track_id}` : 'Person';
            const confidenceText = `${Math.round(detection.confidence * 100)}%`;
            
            // Add breach count if available
            let breachInfo = '';
            if (detection.breach_count) {
                const warningCount = detection.breach_count.warning || 0;
                const dangerCount = detection.breach_count.danger || 0;
                if (warningCount > 0 || dangerCount > 0) {
                    breachInfo = ` [W:${warningCount} D:${dangerCount}]`;
                }
            }
            
            // Add time in zone if currently breaching
            let timeInfo = '';
            if (detection.time_in_zone && detection.breach_type) {
                timeInfo = ` (${detection.time_in_zone}s)`;
            }
            
            const fullLabel = `${trackLabel} - ${statusLabel} ${confidenceText}${breachInfo}${timeInfo}`;
            
            // Adjust font size based on label length
            const fontSize = fullLabel.length > 40 ? 12 : 14;
            ctx.font = `bold ${fontSize}px Arial`;
            const metrics = ctx.measureText(fullLabel);
            
            // Draw label background
            const labelHeight = fontSize + 10;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x1, y1 - labelHeight - 5, metrics.width + 10, labelHeight);
            
            // Draw label text
            ctx.fillStyle = boxColor;
            ctx.fillText(fullLabel, x1 + 5, y1 - 8);
            
            // Draw foot position if available
            if (detection.foot_position) {
                const footX = detection.foot_position[0] * scaling.scaleX;
                const footY = detection.foot_position[1] * scaling.scaleY;
                
                // Draw foot marker circle
                ctx.fillStyle = boxColor;
                ctx.beginPath();
                ctx.arc(footX, footY, 5, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw foot position line
                ctx.strokeStyle = boxColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(footX - 10, footY);
                ctx.lineTo(footX + 10, footY);
                ctx.stroke();
                
                // Add small "F" label for foot
                ctx.font = 'bold 10px Arial';
                ctx.fillStyle = 'white';
                ctx.fillText('F', footX - 3, footY + 3);
            }
            
            // Draw track ID number in center of box (optional)
            if (detection.track_id) {
                const centerX = (x1 + x2) / 2;
                const centerY = (y1 + y2) / 2;
                
                // Draw ID background circle
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
                ctx.fill();
                
                // Draw ID number
                ctx.font = 'bold 16px Arial';
                ctx.fillStyle = 'white';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(detection.track_id.toString(), centerX, centerY);
                
                // Reset text alignment
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }
        });

        currentFrameStats.passengers = currentDetections.length;
    }
    
    // Draw zones if enabled
    if (typeof drawZones === 'function') {
        drawZones();
    }
    
    // Update UI based on detections
    const statusBar = document.getElementById('statusBar');
    
    if (hasDangerBreach && hasWarningBreach) {
        if (!statusBar.classList.contains('both-breach')) {
            simulateBothBreaches();
        }
    } else if (hasDangerBreach) {
        if (!statusBar.classList.contains('red-breach')) {
            simulatePlatformEdgeBreach();
        }
    } else if (hasWarningBreach) {
        if (!statusBar.classList.contains('yellow-breach')) {
            simulateYellowLineBreach();
        }
    } else {
        if (statusBar.classList.contains('yellow-breach') || 
            statusBar.classList.contains('red-breach') || 
            statusBar.classList.contains('both-breach')) {
            clearBreach();
        }
    }
    
    // Update passenger count and statistics
    stats.yellowLineBreach = currentFrameStats.yellowBreaches;
    stats.platformEdgeBreach = currentFrameStats.redBreaches;
    stats.passengerCount = currentFrameStats.passengers;
    updateStatistics();
    
    // Update breach log if new breaches detected
    if (hasWarningBreach || hasDangerBreach) {
        // Add entries to breach log for tracked persons
        currentDetections.forEach(detection => {
            if (detection.breach_type && detection.track_id) {
                // Check if this is a new breach (you might want to track this)
                const currentTime = new Date();
                const timeString = currentTime.toTimeString().split(' ')[0];
                const location = detection.breach_type === 'danger' ? 'Platform Edge' : 'Yellow Line';
                
                // You can add logic here to prevent duplicate entries
                // For now, we'll rely on the backend to handle new breach detection
            }
        });
    }
}

async function resetTrackers(camera = null) {
    try {
        const response = await fetch(`${API_BASE_URL}/reset_trackers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                camera: camera || currentCamera
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Trackers reset successfully');
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
        z-index: 3; /* Higher than detectionCanvas */
    `;
    
    const videoContainer = document.querySelector('.video-container');
    videoContainer.appendChild(zoneCanvas);
    
    return zoneCanvas;
}

function drawZones() {
    if (!showZones || !zoneData || !zoneData.zones) return;
    
    const zoneCanvas = document.getElementById('zoneCanvas') || createZoneCanvas();
    const zoneCtx = zoneCanvas.getContext('2d');
    const scaling = window.videoScaling || { scaleX: 1, scaleY: 1 };
    
    zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
    
    const zones = zoneData.zones;
    
    zoneCtx.save();
    zoneCtx.globalAlpha = 0.3;
    
    // Scale and draw each zone
    ['danger', 'warning', 'safe'].forEach(zoneType => {
        const color = zoneType === 'danger' ? '#ff0000' : 
                     zoneType === 'warning' ? '#ffff00' : '#00ff00';
        
        zoneCtx.fillStyle = color;
        zoneCtx.strokeStyle = color;
        zoneCtx.lineWidth = 3;
        zoneCtx.globalAlpha = 0.3;
        
        // Scale zone points
        const scaledPoints = zones[zoneType].map(point => [
            point[0] * scaling.scaleX,
            point[1] * scaling.scaleY
        ]);
        
        // Fill
        zoneCtx.beginPath();
        scaledPoints.forEach((point, i) => {
            if (i === 0) zoneCtx.moveTo(point[0], point[1]);
            else zoneCtx.lineTo(point[0], point[1]);
        });
        zoneCtx.closePath();
        zoneCtx.fill();
        
        // Stroke
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

// Add a button to toggle zone visualization
function addZoneVisualizationButton() {
    // Remove existing button if present
    const existingBtn = document.querySelector('.zone-viz-btn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.innerHTML = '<i class="fas fa-map"></i> Show Zones';
    button.className = 'zone-viz-btn';
    button.style.cssText = `
        position: absolute;
        top: 60px;  /* Changed from 10px to 60px */
        left: 10px;
        margin-top: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 25;
        font-size: 14px;
        font-weight: bold;
    `;
    
    button.onclick = async () => {
        showZones = !showZones;
        
        if (showZones) {
            // Fetch zone data if not already loaded
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
            // Clear zone canvas
            const zoneCanvas = document.getElementById('zoneCanvas');
            if (zoneCanvas) {
                const zoneCtx = zoneCanvas.getContext('2d');
                zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
            }
        }
    };
    
    document.querySelector('.video-container').appendChild(button);
}

// Modify the video load handler to start processing
function getVideoScaling() {
    const container = document.querySelector('.video-container');
    const displayWidth = videoPlayer.offsetWidth;
    const displayHeight = videoPlayer.offsetHeight;
    const naturalWidth = videoPlayer.videoWidth;
    const naturalHeight = videoPlayer.videoHeight;
    
    // Calculate offset if video is centered
    const offsetX = (container.clientWidth - displayWidth) / 2;
    const offsetY = (container.clientHeight - displayHeight) / 2;
    
    return {
        scaleX: displayWidth / naturalWidth,
        scaleY: displayHeight / naturalHeight,
        offsetX: offsetX,
        offsetY: offsetY,
        displayWidth: displayWidth,
        displayHeight: displayHeight,
        naturalWidth: naturalWidth,
        naturalHeight: naturalHeight
    };
}

// Update handleVideoLoad to properly set canvas dimensions
function handleVideoLoad() {
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    
    // Create zone canvas if it doesn't exist
    const zoneCanvas = createZoneCanvas();
    if (zoneCanvas) {
        zoneCanvas.width = videoPlayer.videoWidth;
        zoneCanvas.height = videoPlayer.videoHeight;
    }
    
    // Add clear video button (which also adds camera selector)
    if (!document.querySelector('.clear-video-btn')) {
        addClearVideoButton();
    }
    
    // Add zone visualization button
    if (!document.querySelector('.zone-viz-btn')) {
        addZoneVisualizationButton();
    }
    
    // Start detection when video is loaded
    startDetection();
}

// In dashboard.js - Optimized settings
const DETECTION_INTERVAL = 0; // 2 seconds
const IMAGE_QUALITY = 1; // 70% JPEG quality
const MAX_IMAGE_SIZE = 1920; // Maximum dimension

async function detectFrame() {
    if (isProcessing || !videoPlayer.src || videoPlayer.paused) return;
    
    isProcessing = true;
    
    try {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Use natural video dimensions for detection
        tempCanvas.width = videoPlayer.videoWidth;
        tempCanvas.height = videoPlayer.videoHeight;
        tempCtx.drawImage(videoPlayer, 0, 0, videoPlayer.videoWidth, videoPlayer.videoHeight);
        
        const blob = await new Promise(resolve => 
            tempCanvas.toBlob(resolve, 'image/jpeg', 0.8)
        );
        
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');
        formData.append('camera', currentCamera);
        
        const response = await fetch(`${API_BASE_URL}/detect`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Don't scale here - let processDetectionResults handle it
            processDetectionResults(result);
        }
    } catch (error) {
        console.error('Detection error:', error);
    } finally {
        isProcessing = false;
    }
}

function startDetection() {
    stopDetection();
    
    detectionInterval = setInterval(() => {
        if (!videoPlayer.paused && !videoPlayer.ended && !isProcessing) {
            detectFrame();
        }
    }, DETECTION_INTERVAL);
    
    // Stats update separately
    setInterval(fetchStats, 5000);
}

function stopDetection() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
}

let lastSeekTime = 0;
videoPlayer.addEventListener('seeking', function() {
    console.log('Video seeking detected');
    // Reset trackers when user seeks more than 2 seconds
    const currentTime = videoPlayer.currentTime;
    if (Math.abs(currentTime - lastSeekTime) > 2) {
        resetTrackers(currentCamera);
    }
    lastSeekTime = currentTime;
});

// Modify video player event handlers
videoPlayer.addEventListener('play', () => {
    console.log('Video playing, starting detection...');
    startDetection();
});

videoPlayer.addEventListener('pause', () => {
    console.log('Video paused, stopping detection...');
    stopDetection();
});

videoPlayer.addEventListener('ended', () => {
    console.log('Video ended, stopping detection...');
    stopDetection();
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
            // Display the image
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    // Process detections
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

// Modify file handling to support both video and images
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
}

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

let currentCamera = 'cam1';

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

    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', async (e) => {
            currentCamera = e.target.value;
            console.log('Camera changed to:', currentCamera);
            
            // Reset zone data when camera changes
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
    
    resetTrackers('all');
    // Add a class to the container to indicate video is loaded
    document.querySelector('.video-container').classList.add('has-video');
}

function showUploadArea() {
    uploadArea.classList.remove('hidden');
    document.querySelector('.video-container').classList.remove('has-video');
}

function clearVideo() {
    videoPlayer.pause();
    videoPlayer.src = '';
    showUploadArea();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    resetTrackers('all');
    
    // Remove clear button
    const clearBtn = document.querySelector('.clear-video-btn');
    if (clearBtn) clearBtn.remove();
    
    // Remove camera selector
    const cameraSelector = document.querySelector('.camera-selector');
    if (cameraSelector) cameraSelector.remove();
    
    // Remove zone visualization button
    const zoneBtn = document.querySelector('.zone-viz-btn');
    if (zoneBtn) zoneBtn.remove();
    
    // Clear zone canvas if it exists
    const zoneCanvas = document.getElementById('zoneCanvas');
    if (zoneCanvas) {
        const zoneCtx = zoneCanvas.getContext('2d');
        zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
    }
    
    // Reset zone states
    showZones = false;
    zoneData = null;
    
    // Stop detection
    stopDetection();
}

// You could add a clear button to your UI
// Or add this to your video controls
function addClearVideoButton() {
    // Add Clear Video button
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
    
    // Also add camera selector when video loads
    createCameraSelector();
}

// Create camera selector function
function createCameraSelector() {
    // Remove existing selector if present
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
    
    // Add to video container
    document.querySelector('.video-container').appendChild(selector);
    
    // Set current camera if it exists
    const cameraSelect = selector.querySelector('#cameraSelect');
    if (currentCamera) {
        cameraSelect.value = currentCamera;
    }
    
    // Add event listener
    cameraSelect.addEventListener('change', async (e) => {
        currentCamera = e.target.value;
        console.log('Camera changed to:', currentCamera);
        
        await resetTrackers(currentCamera);

        // Reset zone data when camera changes
        zoneData = null;
        if (showZones) {
            try {
                const response = await fetch(`${API_BASE_URL}/zones/${currentCamera}`);
                zoneData = await response.json();
                drawZones(); // Redraw zones for new camera
            } catch (error) {
                console.error('Error fetching zones:', error);
            }
        }
    });
}

// Call this when video loads
videoPlayer.addEventListener('loadeddata', function() {
    resetTrackers(currentCamera);
    const existingClearBtn = document.querySelector('.clear-video-btn');
    const existingCameraSelector = document.querySelector('.camera-selector');
    const existingZoneBtn = document.querySelector('.zone-viz-btn');
    
    if (existingClearBtn) existingClearBtn.remove();
    if (existingCameraSelector) existingCameraSelector.remove();
    if (existingZoneBtn) existingZoneBtn.remove();
    
    // Then add them back
    addClearVideoButton();
    addZoneVisualizationButton();

});

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
    
    // Log to server
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
        // Reset stats first
        await fetch(`${API_BASE_URL}/stats/reset`, {
            method: 'POST'
        });
        
        // Then reset trackers with counter reset
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
        
        // Clear local stats
        stats = {
            yellowLineBreach: 0,
            platformEdgeBreach: 0,
            passengerCount: 0
        };
        
        totalBreachCounts = {
            yellow: 0,
            red: 0
        };
        
        // Clear breach log
        loadExistingBreachLog();
        
        // Update displays
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

// Check server status on page load
window.addEventListener('load', async () => {
    const isConnected = await checkServerHealth();
    showServerStatus(isConnected);
});

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
=======
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

let showZones = false;
let zoneData = null;

document.addEventListener('DOMContentLoaded', async function() {
    initializeChart();
    setupEventListeners();
    updateTimestamp();
    loadExistingBreachLog();
    updateBreachChart();
    
    // Check if server is running
    const serverRunning = await checkServerHealth();
    if (serverRunning) {
        console.log('Detection server is running!');
        // Fetch initial stats
        await fetchStats();
    } else {
        console.warn('Detection server is not running. Using demo mode.');
        // Run demo after a delay if server is not available
        setTimeout(() => {
            runBreachDemo();
        }, 1000);
    }
    
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
});


const ICONS = {
    safe: 'assets/icons/safe_icon.png',
    yellowWarning: 'assets/icons/yellowwarning_icon.png',
    redWarning: 'assets/icons/redwarning_icon.png',
    yellowAlert: 'assets/icons/yellowalert_icon.png',
    redAlert: 'assets/icons/redalert_icon.png',
    alertDisabled: 'assets/icons/alert_disabled_icon.png' // You might need a disabled state icon
};

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
        
        // Update statistics display for zone-based breaches
        stats.yellowLineBreach = data.breach_counts?.warning || 0;
        stats.platformEdgeBreach = data.breach_counts?.danger || 0;
        stats.passengerCount = data.total_passengers || 0;
        
        updateStatistics();
        
        // Update breach counts for chart
        totalBreachCounts.yellow = data.breach_counts?.warning || 0;
        totalBreachCounts.red = data.breach_counts?.danger || 0;
        updateBreachChart();
        
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

let currentDetections = [];

// Update the processDetectionResults function to actually draw boxes
function processDetectionResults(result) {
    console.log('Processing detections:', result.detections);
    
    currentDetections = result.detections || [];
    
    // Get current scaling
    const scaling = window.videoScaling || { scaleX: 1, scaleY: 1 };
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let hasWarningBreach = false;
    let hasDangerBreach = false;
    
    if (currentDetections.length > 0) {
        currentDetections.forEach(detection => {
            // Scale coordinates from natural size to display size
            const x1 = detection.x1 * scaling.scaleX;
            const y1 = detection.y1 * scaling.scaleY;
            const x2 = detection.x2 * scaling.scaleX;
            const y2 = detection.y2 * scaling.scaleY;
            
            // Determine color and label
            let boxColor = '#00ff00';
            let statusLabel = 'SAFE';
            
            if (detection.breach_type === 'danger') {
                boxColor = '#ff4444';
                statusLabel = 'DANGER';
                hasDangerBreach = true;
            } else if (detection.breach_type === 'warning') {
                boxColor = '#ffd700';
                statusLabel = 'WARNING';
                hasWarningBreach = true;
            }
            
            // Draw bounding box
            ctx.lineWidth = 3;
            ctx.strokeStyle = boxColor;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            
            // Draw label
            const confidenceText = `${Math.round(detection.confidence * 100)}%`;
            const fullLabel = `${statusLabel} (${confidenceText})`;
            
            ctx.font = 'bold 16px Arial';
            const metrics = ctx.measureText(fullLabel);
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(x1, y1 - 25, metrics.width + 10, 25);
            
            ctx.fillStyle = boxColor;
            ctx.fillText(fullLabel, x1 + 5, y1 - 8);
            
            // Draw center point if available
            if (detection.foot_position) {
            const footX = detection.foot_position[0] * scaling.scaleX;
            const footY = detection.foot_position[1] * scaling.scaleY;
            ctx.fillStyle = boxColor;
            ctx.beginPath();
            ctx.arc(footX, footY, 5, 0, 2 * Math.PI);
            ctx.fill();
            
            // Optional: Draw a small line to indicate it's the foot position
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(footX - 10, footY);
            ctx.lineTo(footX + 10, footY);
            ctx.stroke();
        }
        });
    }
    
    // Draw zones if enabled
    if (typeof drawZones === 'function') {
        drawZones();
    }
    
    // Update UI based on detections
    const statusBar = document.getElementById('statusBar');
    
    if (hasDangerBreach && hasWarningBreach) {
        if (!statusBar.classList.contains('both-breach')) {
            simulateBothBreaches();
        }
    } else if (hasDangerBreach) {
        if (!statusBar.classList.contains('red-breach')) {
            simulatePlatformEdgeBreach();
        }
    } else if (hasWarningBreach) {
        if (!statusBar.classList.contains('yellow-breach')) {
            simulateYellowLineBreach();
        }
    } else {
        if (statusBar.classList.contains('yellow-breach') || 
            statusBar.classList.contains('red-breach') || 
            statusBar.classList.contains('both-breach')) {
            clearBreach();
        }
    }
    
    stats.passengerCount = currentDetections.filter(d => d.label === 'person').length;
    updateStatistics();
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
        z-index: 3; /* Higher than detectionCanvas */
    `;
    
    const videoContainer = document.querySelector('.video-container');
    videoContainer.appendChild(zoneCanvas);
    
    return zoneCanvas;
}

function drawZones() {
    if (!showZones || !zoneData || !zoneData.zones) return;
    
    const zoneCanvas = document.getElementById('zoneCanvas') || createZoneCanvas();
    const zoneCtx = zoneCanvas.getContext('2d');
    const scaling = window.videoScaling || { scaleX: 1, scaleY: 1 };
    
    zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
    
    const zones = zoneData.zones;
    
    zoneCtx.save();
    zoneCtx.globalAlpha = 0.3;
    
    // Scale and draw each zone
    ['danger', 'warning', 'safe'].forEach(zoneType => {
        const color = zoneType === 'danger' ? '#ff0000' : 
                     zoneType === 'warning' ? '#ffff00' : '#00ff00';
        
        zoneCtx.fillStyle = color;
        zoneCtx.strokeStyle = color;
        zoneCtx.lineWidth = 3;
        zoneCtx.globalAlpha = 0.3;
        
        // Scale zone points
        const scaledPoints = zones[zoneType].map(point => [
            point[0] * scaling.scaleX,
            point[1] * scaling.scaleY
        ]);
        
        // Fill
        zoneCtx.beginPath();
        scaledPoints.forEach((point, i) => {
            if (i === 0) zoneCtx.moveTo(point[0], point[1]);
            else zoneCtx.lineTo(point[0], point[1]);
        });
        zoneCtx.closePath();
        zoneCtx.fill();
        
        // Stroke
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

// Add a button to toggle zone visualization
function addZoneVisualizationButton() {
    // Remove existing button if present
    const existingBtn = document.querySelector('.zone-viz-btn');
    if (existingBtn) existingBtn.remove();
    
    const button = document.createElement('button');
    button.innerHTML = '<i class="fas fa-map"></i> Show Zones';
    button.className = 'zone-viz-btn';
    button.style.cssText = `
        position: absolute;
        top: 60px;  /* Changed from 10px to 60px */
        left: 10px;
        margin-top: 10px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 25;
        font-size: 14px;
        font-weight: bold;
    `;
    
    button.onclick = async () => {
        showZones = !showZones;
        
        if (showZones) {
            // Fetch zone data if not already loaded
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
            // Clear zone canvas
            const zoneCanvas = document.getElementById('zoneCanvas');
            if (zoneCanvas) {
                const zoneCtx = zoneCanvas.getContext('2d');
                zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
            }
        }
    };
    
    document.querySelector('.video-container').appendChild(button);
}

// Modify the video load handler to start processing
function getVideoScaling() {
    const container = document.querySelector('.video-container');
    const displayWidth = videoPlayer.offsetWidth;
    const displayHeight = videoPlayer.offsetHeight;
    const naturalWidth = videoPlayer.videoWidth;
    const naturalHeight = videoPlayer.videoHeight;
    
    // Calculate offset if video is centered
    const offsetX = (container.clientWidth - displayWidth) / 2;
    const offsetY = (container.clientHeight - displayHeight) / 2;
    
    return {
        scaleX: displayWidth / naturalWidth,
        scaleY: displayHeight / naturalHeight,
        offsetX: offsetX,
        offsetY: offsetY,
        displayWidth: displayWidth,
        displayHeight: displayHeight,
        naturalWidth: naturalWidth,
        naturalHeight: naturalHeight
    };
}

// Update handleVideoLoad to properly set canvas dimensions
function handleVideoLoad() {
    canvas.width = videoPlayer.videoWidth;
    canvas.height = videoPlayer.videoHeight;
    
    // Create zone canvas if it doesn't exist
    const zoneCanvas = createZoneCanvas();
    if (zoneCanvas) {
        zoneCanvas.width = videoPlayer.videoWidth;
        zoneCanvas.height = videoPlayer.videoHeight;
    }
    
    // Add clear video button (which also adds camera selector)
    if (!document.querySelector('.clear-video-btn')) {
        addClearVideoButton();
    }
    
    // Add zone visualization button
    if (!document.querySelector('.zone-viz-btn')) {
        addZoneVisualizationButton();
    }
    
    // Start detection when video is loaded
    startDetection();
}

// In dashboard.js - Optimized settings
const DETECTION_INTERVAL = 0; // 2 seconds
const IMAGE_QUALITY = 1; // 70% JPEG quality
const MAX_IMAGE_SIZE = 1920; // Maximum dimension

async function detectFrame() {
    if (isProcessing || !videoPlayer.src || videoPlayer.paused) return;
    
    isProcessing = true;
    
    try {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // Use natural video dimensions for detection
        tempCanvas.width = videoPlayer.videoWidth;
        tempCanvas.height = videoPlayer.videoHeight;
        tempCtx.drawImage(videoPlayer, 0, 0, videoPlayer.videoWidth, videoPlayer.videoHeight);
        
        const blob = await new Promise(resolve => 
            tempCanvas.toBlob(resolve, 'image/jpeg', 0.8)
        );
        
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');
        formData.append('camera', currentCamera);
        
        const response = await fetch(`${API_BASE_URL}/detect`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Don't scale here - let processDetectionResults handle it
            processDetectionResults(result);
        }
    } catch (error) {
        console.error('Detection error:', error);
    } finally {
        isProcessing = false;
    }
}

function startDetection() {
    stopDetection();
    
    detectionInterval = setInterval(() => {
        if (!videoPlayer.paused && !videoPlayer.ended && !isProcessing) {
            detectFrame();
        }
    }, DETECTION_INTERVAL);
    
    // Stats update separately
    setInterval(fetchStats, 5000);
}

function stopDetection() {
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
}

// Modify video player event handlers
videoPlayer.addEventListener('play', () => {
    console.log('Video playing, starting detection...');
    startDetection();
});

videoPlayer.addEventListener('pause', () => {
    console.log('Video paused, stopping detection...');
    stopDetection();
});

videoPlayer.addEventListener('ended', () => {
    console.log('Video ended, stopping detection...');
    stopDetection();
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
            // Display the image
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    
                    // Process detections
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

// Modify file handling to support both video and images
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
}

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

let currentCamera = 'cam1';

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

    const cameraSelect = document.getElementById('cameraSelect');
    if (cameraSelect) {
        cameraSelect.addEventListener('change', async (e) => {
            currentCamera = e.target.value;
            console.log('Camera changed to:', currentCamera);
            
            // Reset zone data when camera changes
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
    
    // Add a class to the container to indicate video is loaded
    document.querySelector('.video-container').classList.add('has-video');
}

function showUploadArea() {
    uploadArea.classList.remove('hidden');
    document.querySelector('.video-container').classList.remove('has-video');
}

function clearVideo() {
    videoPlayer.pause();
    videoPlayer.src = '';
    showUploadArea();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Remove clear button
    const clearBtn = document.querySelector('.clear-video-btn');
    if (clearBtn) clearBtn.remove();
    
    // Remove camera selector
    const cameraSelector = document.querySelector('.camera-selector');
    if (cameraSelector) cameraSelector.remove();
    
    // Remove zone visualization button
    const zoneBtn = document.querySelector('.zone-viz-btn');
    if (zoneBtn) zoneBtn.remove();
    
    // Clear zone canvas if it exists
    const zoneCanvas = document.getElementById('zoneCanvas');
    if (zoneCanvas) {
        const zoneCtx = zoneCanvas.getContext('2d');
        zoneCtx.clearRect(0, 0, zoneCanvas.width, zoneCanvas.height);
    }
    
    // Reset zone states
    showZones = false;
    zoneData = null;
    
    // Stop detection
    stopDetection();
}

// You could add a clear button to your UI
// Or add this to your video controls
function addClearVideoButton() {
    // Add Clear Video button
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
    
    // Also add camera selector when video loads
    createCameraSelector();
}

// Create camera selector function
function createCameraSelector() {
    // Remove existing selector if present
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
    
    // Add to video container
    document.querySelector('.video-container').appendChild(selector);
    
    // Set current camera if it exists
    const cameraSelect = selector.querySelector('#cameraSelect');
    if (currentCamera) {
        cameraSelect.value = currentCamera;
    }
    
    // Add event listener
    cameraSelect.addEventListener('change', async (e) => {
        currentCamera = e.target.value;
        console.log('Camera changed to:', currentCamera);
        
        // Reset zone data when camera changes
        zoneData = null;
        if (showZones) {
            try {
                const response = await fetch(`${API_BASE_URL}/zones/${currentCamera}`);
                zoneData = await response.json();
                drawZones(); // Redraw zones for new camera
            } catch (error) {
                console.error('Error fetching zones:', error);
            }
        }
    });
}

// Call this when video loads
videoPlayer.addEventListener('loadeddata', function() {
    const existingClearBtn = document.querySelector('.clear-video-btn');
    const existingCameraSelector = document.querySelector('.camera-selector');
    const existingZoneBtn = document.querySelector('.zone-viz-btn');
    
    if (existingClearBtn) existingClearBtn.remove();
    if (existingCameraSelector) existingCameraSelector.remove();
    if (existingZoneBtn) existingZoneBtn.remove();
    
    // Then add them back
    addClearVideoButton();
    addZoneVisualizationButton();

});

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
    
    // Log to server
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

// Check server status on page load
window.addEventListener('load', async () => {
    const isConnected = await checkServerHealth();
    showServerStatus(isConnected);
});

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
>>>>>>> 57d68d73214ebd7cb640120d0a856c49926a961f
};