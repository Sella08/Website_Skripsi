// script.js

// System Configuration
const DEVICE_CONFIG = {
    L1: { name: 'Lampu Teras', power: 10, type: 'lamp' },
    L2: { name: 'Lampu Ruang Tamu', power: 20, type: 'lamp' },
    L3: { name: 'Lampu Kamar', power: 10, type: 'lamp' },
    L4: { name: 'Lampu WC', power: 5, type: 'lamp' },
    L5: { name: 'Lampu Dapur', power: 30, type: 'lamp' },
    K1: { name: 'Kipas Kamar', power: 12, type: 'fan' },
    K2: { name: 'Kipas Ruang Tamu', power: 12, type: 'fan' }
};

const BATTERY_CONFIG = {
    capacity: 200, // Ah
    voltage: 12,   // V
    cutoffDOD: 65  // %
};

// System State
let systemState = {
    devices: {
        L1: false, L2: false, L3: false, L4: false, L5: false,
        K1: false, K2: false
    },
    battery: {
        voltage: 12.6,
        soc: 75,
        dod: 25,
        currentCapacity: 150
    },
    sensors: {
        temperature: 28,
        humidity: 65,
        lightLevel: 250,
        motionDetected: false
    },
    isConnected: true
};

// ESP8266 Configuration
const ESP8266_CONFIG = {
    ip: '192.168.1.100', // Ganti dengan IP ESP8266 Anda
    port: 80,
    updateInterval: 2000 // 2 detik
};

// Initialize System
document.addEventListener('DOMContentLoaded', function() {
    console.log('Smart Home DC System Starting...');
    initializeSystem();
    startDataPolling();
    setupEventListeners();
});

function initializeSystem() {
    updateBatteryDisplay();
    updateDeviceDisplay();
    updateSensorDisplay();
    updatePowerCalculations();
    
    // Apply smart home logic based on initial state
    applySmartHomeLogic();
}

function setupEventListeners() {
    // Device click handlers are already set in HTML onclick attributes
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
            switch(e.key) {
                case '1': toggleDevice('L1'); break;
                case '2': toggleDevice('L2'); break;
                case '3': toggleDevice('L3'); break;
                case '4': toggleDevice('L4'); break;
                case '5': toggleDevice('L5'); break;
                case 'q': toggleDevice('K1'); break;
                case 'w': toggleDevice('K2'); break;
            }
        }
    });
}

// Device Control Functions
function toggleDevice(deviceId) {
    console.log(`Toggling device: ${deviceId}`);
    
    // Check if device can be turned on based on battery level
    if (!systemState.devices[deviceId] && !canActivateDevice(deviceId)) {
        showAlert('Tidak dapat mengaktifkan perangkat. Kapasitas baterai tidak mencukupi!');
        return;
    }
    
    systemState.devices[deviceId] = !systemState.devices[deviceId];
    
    // Send command to ESP8266
    sendDeviceCommand(deviceId, systemState.devices[deviceId]);
    
    // Update display
    updateDeviceDisplay();
    updatePowerCalculations();
    
    // Apply smart home logic after device change
    applySmartHomeLogic();
    
    console.log(`Device ${deviceId} is now ${systemState.devices[deviceId] ? 'ON' : 'OFF'}`);
}

function canActivateDevice(deviceId) {
    // Check if battery DOD allows activation
    if (systemState.battery.dod >= BATTERY_CONFIG.cutoffDOD) {
        return false;
    }
    
    // Calculate new total power if device is activated
    let newTotalPower = calculateTotalPower();
    newTotalPower += DEVICE_CONFIG[deviceId].power;
    
    // Check if battery can handle the load
    const estimatedRuntime = calculateEstimatedRuntime(newTotalPower);
    
    return estimatedRuntime > 0.5; // At least 30 minutes runtime
}

// Power Calculation Functions
function calculateTotalPower() {
    let totalPower = 0;
    for (let deviceId in systemState.devices) {
        if (systemState.devices[deviceId]) {
            totalPower += DEVICE_CONFIG[deviceId].power;
        }
    }
    return totalPower;
}

function calculateTotalCurrent() {
    const totalPower = calculateTotalPower();
    return totalPower / systemState.battery.voltage;
}

function calculateEstimatedRuntime(power = null) {
    const currentPower = power || calculateTotalPower();
    if (currentPower === 0) return Infinity;
    
    const availableCapacity = systemState.battery.currentCapacity;
    const hours = (availableCapacity * systemState.battery.voltage) / currentPower;
    
    return Math.max(0, hours);
}

// Smart Home Logic Implementation
function applySmartHomeLogic() {
    const soc = systemState.battery.soc;
    const dod = systemState.battery.dod;
    
    // Emergency shutdown if DOD >= 65%
    if (dod >= BATTERY_CONFIG.cutoffDOD) {
        emergencyShutdown();
        return;
    }
    
    // Apply load priority based on SOC
    applyLoadPriority(soc);
    
    // Apply environmental controls
    applyEnvironmentalControls();
    
    // Update alerts
    updateSystemAlerts();
}

function emergencyShutdown() {
    console.log('Emergency shutdown activated - DOD >= 65%');
    
    // Turn off all non-critical devices
    for (let deviceId in systemState.devices) {
        if (systemState.devices[deviceId]) {
            systemState.devices[deviceId] = false;
            sendDeviceCommand(deviceId, false);
        }
    }
    
    showAlert('EMERGENCY: Semua beban dimatikan otomatis - DOD mencapai 65%!');
    updateDeviceDisplay();
    updatePowerCalculations();
}

function applyLoadPriority(soc) {
    const activeDevices = [];
    
    // Determine which devices should be active based on SOC
    if (soc >= 90) {
        // All devices can be active
        activeDevices.push('L1', 'L2', 'L3', 'L4', 'L5', 'K1', 'K2');
    } else if (soc >= 80) {
        // High priority devices
        activeDevices.push('L1', 'L2', 'L3', 'L4', 'L5', 'K1');
    } else if (soc >= 70) {
        // Medium priority devices
        activeDevices.push('L1', 'L2', 'L3', 'L4', 'L5');
    } else if (soc >= 60) {
        // Low-medium priority devices
        activeDevices.push('L1', 'L2', 'L3', 'L4');
    } else if (soc >= 50) {
        // Low priority devices
        activeDevices.push('L1', 'L2', 'L3');
    } else if (soc > 35) {
        // Critical devices only
        activeDevices.push('L1', 'L2');
    }
    
    // Auto-disable devices not in priority list
    for (let deviceId in systemState.devices) {
        if (systemState.devices[deviceId] && !activeDevices.includes(deviceId)) {
            console.log(`Auto-disabling ${deviceId} due to low battery`);
            systemState.devices[deviceId] = false;
            sendDeviceCommand(deviceId, false);
        }
    }
}

function applyEnvironmentalControls() {
    const { temperature, lightLevel, motionDetected } = systemState.sensors;
    
    // Auto lamp control based on light level and motion
    if (lightLevel <= 150 && motionDetected) {
        // Auto-enable lamps if conditions are met and battery allows
        ['L1', 'L2', 'L3', 'L4', 'L5'].forEach(lampId => {
            if (!systemState.devices[lampId] && canActivateDevice(lampId)) {
                systemState.devices[lampId] = true;
                sendDeviceCommand(lampId, true);
                console.log(`Auto-enabled ${lampId} due to low light and motion`);
            }
        });
    } else if (lightLevel > 150 || !motionDetected) {
        // Auto-disable lamps if no motion or sufficient light
        ['L1', 'L2', 'L3', 'L4', 'L5'].forEach(lampId => {
            if (systemState.devices[lampId]) {
                systemState.devices[lampId] = false;
                sendDeviceCommand(lampId, false);
                console.log(`Auto-disabled ${lampId} - no motion or sufficient light`);
            }
        });
    }
    
    // Auto fan control based on temperature and motion
    if (temperature >= 32 && motionDetected) {
        ['K1', 'K2'].forEach(fanId => {
            if (!systemState.devices[fanId] && canActivateDevice(fanId)) {
                systemState.devices[fanId] = true;
                sendDeviceCommand(fanId, true);
                console.log(`Auto-enabled ${fanId} due to high temperature and motion`);
            }
        });
    } else if (temperature < 32 || !motionDetected) {
        ['K1', 'K2'].forEach(fanId => {
            if (systemState.devices[fanId]) {
                systemState.devices[fanId] = false;
                sendDeviceCommand(fanId, false);
                console.log(`Auto-disabled ${fanId} - temperature OK or no motion`);
            }
        });
    }
}

// ESP8266 Communication Functions
async function sendDeviceCommand(deviceId, state) {
    if (!systemState.isConnected) {
        console.log('ESP8266 not connected - command queued');
        return;
    }
    
    try {
        const response = await fetch(`http://${ESP8266_CONFIG.ip}:${ESP8266_CONFIG.port}/control`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                device: deviceId,
                state: state ? 1 : 0,
                timestamp: Date.now()
            })
        });
        
        if (response.ok) {
            console.log(`Command sent successfully: ${deviceId} = ${state}`);
        } else {
            console.error('Failed to send command to ESP8266');
        }
    } catch (error) {
        console.error('ESP8266 communication error:', error);
        systemState.isConnected = false;
        updateConnectionStatus();
    }
}

async function fetchSensorData() {
    if (!systemState.isConnected) {
        return;
    }
    
    try {
        const response = await fetch(`http://${ESP8266_CONFIG.ip}:${ESP8266_CONFIG.port}/data`);
        
        if (response.ok) {
            const data = await response.json();
            updateSystemFromESP8266(data);
            systemState.isConnected = true;
        } else {
            throw new Error('Failed to fetch data');
        }
    } catch (error) {
        console.error('Failed to fetch sensor data:', error);
        systemState.isConnected = false;
        simulateSensorData(); // Fallback to simulation
    }
    
    updateConnectionStatus();
}

function updateSystemFromESP8266(data) {
    // Update battery data
    if (data.battery) {
        systemState.battery.voltage = data.battery.voltage || systemState.battery.voltage;
        systemState.battery.soc = data.battery.soc || systemState.battery.soc;
        systemState.battery.dod = 100 - systemState.battery.soc;
        systemState.battery.currentCapacity = (systemState.battery.soc / 100) * BATTERY_CONFIG.capacity;
    }
    
    // Update sensor data
    if (data.sensors) {
        systemState.sensors.temperature = data.sensors.temperature || systemState.sensors.temperature;
        systemState.sensors.humidity = data.sensors.humidity || systemState.sensors.humidity;
        systemState.sensors.lightLevel = data.sensors.lightLevel || systemState.sensors.lightLevel;
        systemState.sensors.motionDetected = data.sensors.motionDetected || false;
    }
    
    // Update device power readings from INA226 sensors
    if (data.power) {
        updatePowerReadings(data.power);
    }
}

function updatePowerReadings(powerData) {
    // Update individual device power readings
    for (let deviceId in powerData) {
        if (DEVICE_CONFIG[deviceId]) {
            const reading = powerData[deviceId];
            updateDeviceMetrics(deviceId, reading.voltage, reading.current, reading.power);
        }
    }
}

// Display Update Functions
function updateDeviceDisplay() {
    for (let deviceId in systemState.devices) {
        const isActive = systemState.devices[deviceId];
        const deviceElement = document.querySelector(`[data-device="${deviceId}"]`);
        const statusElement = document.getElementById(`status-${deviceId}`);
        const deviceItemElement = document.querySelector(`.device-item[data-device="${deviceId}"]`);
        
        if (deviceElement) {
            if (isActive) {
                deviceElement.classList.add('active');
            } else {
                deviceElement.classList.remove('active');
            }
        }
        
        if (statusElement) {
            statusElement.textContent = isActive ? 'ON' : 'OFF';
            statusElement.className = `device-status ${isActive ? 'on' : ''}`;
        }
        
        if (deviceItemElement) {
            if (isActive) {
                deviceItemElement.classList.add('active');
            } else {
                deviceItemElement.classList.remove('active');
            }
        }
    }
}

function updateDeviceMetrics(deviceId, voltage, current, power) {
    const voltageElement = document.getElementById(`voltage-${deviceId}`);
    const currentElement = document.getElementById(`current-${deviceId}`);
    const powerElement = document.getElementById(`power-${deviceId}`);
    
    if (voltageElement) voltageElement.textContent = `${voltage.toFixed(1)}V`;
    if (currentElement) currentElement.textContent = `${current.toFixed(2)}A`;
    if (powerElement) powerElement.textContent = `${power.toFixed(1)}W`;
}

function updateBatteryDisplay() {
    const { soc, voltage, dod } = systemState.battery;
    
    // Update battery level visual
    const batteryLevel = document.getElementById('battery-level');
    if (batteryLevel) {
        batteryLevel.style.width = `${soc}%`;
    }
    
    // Update battery percentage
    const batteryPercentage = document.getElementById('battery-percentage');
    if (batteryPercentage) {
        batteryPercentage.textContent = `${soc}%`;
    }
    
    // Update battery info
    const batteryVoltage = document.getElementById('battery-voltage');
    if (batteryVoltage) {
        batteryVoltage.textContent = `${voltage.toFixed(1)}V`;
    }
    
    const batterySoc = document.getElementById('battery-soc');
    if (batterySoc) {
        batterySoc.textContent = `${soc}%`;
    }
    
    const batteryDod = document.getElementById('battery-dod');
    if (batteryDod) {
        batteryDod.textContent = `${dod}%`;
    }
    
    // Update estimated runtime
    const estimatedRuntime = calculateEstimatedRuntime();
    const runtimeElement = document.getElementById('estimated-runtime');
    if (runtimeElement) {
        if (estimatedRuntime === Infinity) {
            runtimeElement.textContent = '∞';
        } else {
            runtimeElement.textContent = `${estimatedRuntime.toFixed(1)}h`;
        }
    }
}

function updateSensorDisplay() {
    const { temperature, humidity, lightLevel, motionDetected } = systemState.sensors;
    
    const tempElement = document.getElementById('temperature');
    if (tempElement) tempElement.textContent = `${temperature}°C`;
    
    const humidityElement = document.getElementById('humidity');
    if (humidityElement) humidityElement.textContent = `${humidity}%`;
    
    const lightElement = document.getElementById('light-level');
    if (lightElement) lightElement.textContent = `${lightLevel} lux`;
    
    const motionElement = document.getElementById('motion-status');
    if (motionElement) {
        motionElement.textContent = motionDetected ? 'Terdeteksi' : 'Tidak Ada';
    }
}

function updatePowerCalculations() {
    const totalPower = calculateTotalPower();
    const totalCurrent = calculateTotalCurrent();
    
    const totalPowerElement = document.getElementById('total-power');
    if (totalPowerElement) {
        totalPowerElement.textContent = `${totalPower}W`;
    }
    
    const totalCurrentElement = document.getElementById('total-current');
    if (totalCurrentElement) {
        totalCurrentElement.textContent = `${totalCurrent.toFixed(2)}A`;
    }
    
    // Update individual device metrics for active devices
    for (let deviceId in systemState.devices) {
        if (systemState.devices[deviceId]) {
            const power = DEVICE_CONFIG[deviceId].power;
            const current = power / systemState.battery.voltage;
            const voltage = systemState.battery.voltage;
            
            updateDeviceMetrics(deviceId, voltage, current, power);
        } else {
            updateDeviceMetrics(deviceId, 0, 0, 0);
        }
    }
}

function updateConnectionStatus() {
    const indicator = document.querySelector('.indicator');
    const statusText = document.querySelector('.status-indicator span:last-child');
    
    if (indicator && statusText) {
        if (systemState.isConnected) {
            indicator.className = 'indicator online';
            statusText.textContent = 'ESP8266 Connected';
        } else {
            indicator.className = 'indicator offline';
            statusText.textContent = 'ESP8266 Disconnected';
        }
    }
}

function updateSystemAlerts() {
    const alertPanel = document.getElementById('alert-panel');
    const alertMessage = document.getElementById('alert-message');
    
    let alertText = '';
    let showAlert = false;
    
    if (systemState.battery.dod >= BATTERY_CONFIG.cutoffDOD) {
        alertText = '🚨 EMERGENCY: DOD mencapai 65%! Semua beban telah dimatikan otomatis.';
        showAlert = true;
    } else if (systemState.battery.soc <= 40) {
        alertText = '⚠️ Peringatan: Kapasitas baterai rendah! Mode hemat energi aktif.';
        showAlert = true;
    } else if (!systemState.isConnected) {
        alertText = '📡 Peringatan: Koneksi ESP8266 terputus!';
        showAlert = true;
    }
    
    if (alertPanel && alertMessage) {
        if (showAlert) {
            alertMessage.textContent = alertText;
            alertPanel.style.display = 'block';
        } else {
            alertPanel.style.display = 'none';
        }
    }
}

function showAlert(message) {
    const alertPanel = document.getElementById('alert-panel');
    const alertMessage = document.getElementById('alert-message');
    
    if (alertPanel && alertMessage) {
        alertMessage.textContent = message;
        alertPanel.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (alertPanel.style.display === 'block') {
                alertPanel.style.display = 'none';
            }
        }, 5000);
    }
}

// Simulation Functions (for testing without ESP8266)
function simulateSensorData() {
    // Simulate gradual battery discharge
    if (calculateTotalPower() > 0) {
        systemState.battery.soc -= 0.1;
        systemState.battery.dod = 100 - systemState.battery.soc;
        systemState.battery.currentCapacity = (systemState.battery.soc / 100) * BATTERY_CONFIG.capacity;
        
        if (systemState.battery.soc < 0) {
            systemState.battery.soc = 0;
            systemState.battery.dod = 100;
        }
    }
    
    // Simulate sensor variations
    systemState.sensors.temperature = 25 + Math.random() * 10;
    systemState.sensors.humidity = 60 + Math.random() * 20;
    systemState.sensors.lightLevel = 100 + Math.random() * 300;
    systemState.sensors.motionDetected = Math.random() > 0.7;
    
    console.log('Simulated sensor data updated');
}

// Main Update Loop
function startDataPolling() {
    setInterval(async () => {
        await fetchSensorData();
        updateBatteryDisplay();
        updateSensorDisplay();
        updatePowerCalculations();
        applySmartHomeLogic();
        updateDeviceDisplay();
    }, ESP8266_CONFIG.updateInterval);
    
    console.log('Data polling started');
}

// Utility Functions
function formatTime(hours) {
    if (hours === Infinity) return '∞';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${hours.toFixed(1)}h`;
}

// Export functions for debugging (optional)
window.smartHome = {
    toggleDevice,
    systemState,
    simulateSensorData,
    emergencyShutdown,
    calculateTotalPower,
    calculateEstimatedRuntime
};