document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const webcamVideo = document.getElementById('webcam');
    const canvas = document.getElementById('canvas');
    const processedImage = document.getElementById('processed-image');
    const webcamError = document.getElementById('webcam-error');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const sessionDuration = document.getElementById('session-duration');
    const alertCount = document.getElementById('alert-count');
    const fpsCount = document.getElementById('fps-count');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const loginModal = document.getElementById('login-modal');
    const settingsModal = document.getElementById('settings-modal');
    const closeButtons = document.querySelectorAll('.close');
    const alertSound = document.getElementById('alert-sound');
    const sensitivitySlider = document.getElementById('sensitivity');
    const sensitivityValue = document.getElementById('sensitivity-value');
    const alertVolumeSlider = document.getElementById('alert-volume');
    const volumeValue = document.getElementById('volume-value');
    const alertTypeSelect = document.getElementById('alert-type');
    const cameraSelect = document.getElementById('camera-select');
    const frameRateSlider = document.getElementById('frame-rate');
    const frameRateValue = document.getElementById('frame-rate-value');
    const saveSettingsBtn = document.getElementById('save-settings');

    // Canvas context
    const ctx = canvas.getContext('2d');

    // State variables
    let isMonitoring = false;
    let sessionStartTime = null;
    let sessionTimer = null;
    let alertsCount = 0;
    let isUserLoggedIn = true; // User Logging (Without logging = true )
    let frameCapture = null;
    let stream = null;
    let lastFrameTime = 0;
    let frameCount = 0;
    let fpsInterval = 0;
    let frameRate = 10; // Default 10 FPS
    let availableCameras = [];
    
    // Settings
    let settings = {
        sensitivity: 5,
        alertVolume: 7,
        alertType: 'both',
        frameRate: 10,
        selectedCamera: ''
    };

    // Show login modal on page load
    window.addEventListener('load', function() {
        if (!isUserLoggedIn) {
            loginModal.style.display = 'block';
        }
        // Get available cameras
        listCameras();
    });

    // Close modals when clicking the close button
    closeButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            loginModal.style.display = 'none';
            settingsModal.style.display = 'none';
        });
    });

    // Close modals when clicking outside the modal content
    window.addEventListener('click', function(event) {
        if (event.target === loginModal) {
            loginModal.style.display = 'none';
        }
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
    });

    // Handle Google Sign-In
    window.handleCredentialResponse = function(response) {
        // In a real application, you would verify the credential with your backend
        console.log("Google Sign-In successful:", response);
        isUserLoggedIn = true;
        loginModal.style.display = 'none';
    };

    // Get list of available cameras
    async function listCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            // Filter for video input devices (cameras)
            availableCameras = devices.filter(device => device.kind === 'videoinput');
            
            // Clear and populate camera select dropdown
            cameraSelect.innerHTML = '';
            
            if (availableCameras.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.text = 'No cameras found';
                cameraSelect.appendChild(option);
            } else {
                availableCameras.forEach((camera, index) => {
                    const option = document.createElement('option');
                    option.value = camera.deviceId;
                    option.text = camera.label || `Camera ${index + 1}`;
                    cameraSelect.appendChild(option);
                });
                
                // Set default camera (first one)
                if (!settings.selectedCamera && availableCameras.length > 0) {
                    settings.selectedCamera = availableCameras[0].deviceId;
                }
            }
        } catch (error) {
            console.error('Error listing cameras:', error);
            webcamError.style.display = 'block';
            webcamError.textContent = 'Error accessing camera list: ' + error.message;
        }
    }

    // Start webcam
    async function startWebcam() {
        try {
            // Stop any existing stream
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            
            // Get user media constraints
            const constraints = {
                video: {
                    deviceId: settings.selectedCamera ? { exact: settings.selectedCamera } : undefined,
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                }
            };
            
            // Get access to webcam
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Set video source
            webcamVideo.srcObject = stream;
            
            // Set canvas size once video metadata is loaded
            webcamVideo.onloadedmetadata = () => {
                canvas.width = webcamVideo.videoWidth;
                canvas.height = webcamVideo.videoHeight;
                webcamError.style.display = 'none';
            };
            
            return true;
        } catch (error) {
            console.error('Error accessing webcam:', error);
            webcamError.style.display = 'block';
            webcamError.textContent = 'Error accessing webcam: ' + error.message;
            return false;
        }
    }

    // Capture frame from webcam
    function captureFrame() {
        if (!webcamVideo.videoWidth) return null;
        
        // Draw video frame to canvas
        ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);
        
        // Calculate FPS
        const now = performance.now();
        const elapsed = now - lastFrameTime;
        frameCount++;
        
        if (elapsed >= 1000) { // Update FPS every second
            fpsCount.textContent = Math.round(frameCount * 1000 / elapsed);
            frameCount = 0;
            lastFrameTime = now;
        }
        
        // Convert canvas to base64 image
        return canvas.toDataURL('image/jpeg', 0.8);
    }

    // Send frame to server for processing
    async function sendFrameToServer(imageData) {
        try {
            const response = await fetch('/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ image: imageData })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Update UI with response
            if (data.drowsiness_detected) {
                // Update UI to show alert
                statusIndicator.className = 'status-alert';
                statusText.textContent = 'DROWSINESS DETECTED!';
                
                // Play alert sound
                if (settings.alertType === 'beep' || settings.alertType === 'both') {
                    alertSound.play();
                }
                
                // Increment alert count
                alertsCount++;
                alertCount.textContent = alertsCount;
            } else {
                // Reset UI to normal state
                statusIndicator.className = 'status-normal';
                statusText.textContent = 'Monitoring...';
            }
            
            // Display processed image if available
            if (data.processed_image) {
                processedImage.src = data.processed_image;
                processedImage.style.display = 'block';
                canvas.style.display = 'none';
            } else {
                processedImage.style.display = 'none';
                canvas.style.display = 'block';
            }
            
            return data.drowsiness_detected;
        } catch (error) {
            console.error('Error sending frame to server:', error);
            return false;
        }
    }

    // Frame capture loop
    function startFrameCapture() {
        // Calculate frame interval based on desired frame rate
        fpsInterval = 1000 / settings.frameRate;
        lastFrameTime = performance.now();
        frameCount = 0;
        
        // Clear any existing interval
        if (frameCapture) {
            clearInterval(frameCapture);
        }
        
        // Start new capture interval
        frameCapture = setInterval(async () => {
            if (!isMonitoring) return;
            
            const imageData = captureFrame();
            if (imageData) {
                await sendFrameToServer(imageData);
            }
        }, fpsInterval);
    }

    // Start monitoring button
    startBtn.addEventListener('click', async function() {
        if (!isUserLoggedIn) {
            loginModal.style.display = 'block';
            return;
        }

        // Start webcam
        const webcamStarted = await startWebcam();
        if (!webcamStarted) return;

        isMonitoring = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusIndicator.className = 'status-normal';
        statusText.textContent = 'Monitoring...';
        
        // Start session timer
        sessionStartTime = new Date();
        sessionTimer = setInterval(updateSessionDuration, 1000);
        
        // Start frame capture
        startFrameCapture();
    });

    // Stop monitoring button
    stopBtn.addEventListener('click', function() {
        isMonitoring = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusIndicator.className = 'status-normal';
        statusText.textContent = 'Monitoring stopped';
        
        // Stop session timer
        clearInterval(sessionTimer);
        
        // Stop frame capture
        if (frameCapture) {
            clearInterval(frameCapture);
            frameCapture = null;
        }
        
        // Stop webcam stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
    });

    // Settings button
    settingsBtn.addEventListener('click', function() {
        if (!isUserLoggedIn) {
            loginModal.style.display = 'block';
            return;
        }
        
        // Update settings UI with current values
        sensitivitySlider.value = settings.sensitivity;
        sensitivityValue.textContent = settings.sensitivity;
        alertVolumeSlider.value = settings.alertVolume;
        volumeValue.textContent = settings.alertVolume;
        alertTypeSelect.value = settings.alertType;
        frameRateSlider.value = settings.frameRate;
        frameRateValue.textContent = settings.frameRate;
        
        if (settings.selectedCamera) {
            cameraSelect.value = settings.selectedCamera;
        }
        
        settingsModal.style.display = 'block';
    });

    // Update sensitivity value display
    sensitivitySlider.addEventListener('input', function() {
        sensitivityValue.textContent = this.value;
    });

    // Update volume value display
    alertVolumeSlider.addEventListener('input', function() {
        volumeValue.textContent = this.value;
    });

    // Update frame rate value display
    frameRateSlider.addEventListener('input', function() {
        frameRateValue.textContent = this.value;
    });

    // Save settings
    saveSettingsBtn.addEventListener('click', function() {
        settings.sensitivity = parseInt(sensitivitySlider.value);
        settings.alertVolume = parseInt(alertVolumeSlider.value);
        settings.alertType = alertTypeSelect.value;
        settings.frameRate = parseInt(frameRateSlider.value);
        settings.selectedCamera = cameraSelect.value;
        
        // Apply settings
        alertSound.volume = settings.alertVolume / 10;
        
        // If monitoring is active, update frame capture rate
        if (isMonitoring) {
            startFrameCapture();
        }
        
        settingsModal.style.display = 'none';
    });

    // Update session duration display
    function updateSessionDuration() {
        if (!sessionStartTime) return;
        
        const now = new Date();
        const diff = now - sessionStartTime;
        
        const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        
        sessionDuration.textContent = `${hours}:${minutes}:${seconds}`;
    }
}); 