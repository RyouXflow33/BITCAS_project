// MVC: shared constants and static datasets (Model layer support).
const BITCAS_STORAGE_KEY = 'bitcas_ui_sim_v1';
const BITCAS_AUTH_KEY = 'bitcas_auth_v1';
const VISION_FIXTURE_URL = 'assets/data/congestion.json';
const VISION_POLL_MS = 3000;
const VISION_HISTORY_URL = 'assets/data/traffic_history.json';
const VILLAMONTE_TRAFFIC_ROAD = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        properties: { name: 'Circumferential Road', area: 'Barangay Villamonte, Bacolod City' },
        geometry: {
            type: 'LineString',
            coordinates: [
                [122.9585203, 10.6681712], [122.9597650, 10.6676309], [122.9614676, 10.6668880],
                [122.9632707, 10.6661152], [122.9654193, 10.6651956], [122.9676478, 10.6642276],
                [122.9698366, 10.6632997], [122.9712756, 10.6626900]
            ]
        }
    }]
};
const VISION_SIMULATION_SAMPLES = [
    { congestion_level: 'LIGHT', color: '#27ae60', label: 'LIGHT', vehicle_count: 3, detections_count: 3, vehicle_types: { car: 2, motorcycle: 1 }, positions: [0.18, 0.47, 0.72], avg_speed: 27.4 },
    { congestion_level: 'MODERATE', color: '#f39c12', label: 'MODERATE', vehicle_count: 8, detections_count: 8, vehicle_types: { car: 6, bus: 1, motorcycle: 1 }, positions: [0.08, 0.2, 0.34, 0.49, 0.58, 0.67, 0.81, 0.93], avg_speed: 15.8 },
    { congestion_level: 'HEAVY', color: '#e74c3c', label: 'HEAVY', vehicle_count: 17, detections_count: 17, vehicle_types: { car: 12, bus: 2, truck: 1, motorcycle: 2 }, positions: [0.04, 0.1, 0.16, 0.23, 0.3, 0.37, 0.44, 0.5, 0.56, 0.61, 0.67, 0.73, 0.79, 0.84, 0.89, 0.94, 0.98], avg_speed: 7.2 }
];
