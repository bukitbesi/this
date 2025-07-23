// main.js

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENT SELECTORS ---
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    const vehicleClassSelect = document.getElementById('vehicle-class');
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsDiv = document.getElementById('results');
    const loadingDiv = document.getElementById('loading');
    const errorMessageDiv = document.getElementById('error-message');
    const resultsContentDiv = document.getElementById('results-content');
    const totalTollSpan = document.getElementById('total-toll');
    const totalDistanceSpan = document.getElementById('total-distance');
    const totalTimeSpan = document.getElementById('total-time');
    const tollBreakdownList = document.getElementById('toll-breakdown-list');
    const dataTimestampSpan = document.getElementById('data-update-timestamp');
    const fuelTypeSelect = document.getElementById('fuel-type');
    const fuelEfficiencyInput = document.getElementById('fuel-efficiency');
    const fuelCostSpan = document.getElementById('fuel-cost');
    const totalJourneyCostSpan = document.getElementById('total-journey-cost');

    // --- STATE ---
    let map;
    let routePolyline;
    let markers =;
    let lastRouteResult = null; // Cache the last route result

    // --- INITIALIZATION ---
    function initialize() {
        initMap();
        initAutocomplete();
        setupEventListeners();
        displayDataTimestamp();
    }

    function initMap() {
        map = L.map('map').setView([4.2105, 101.9758], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    }

    function initAutocomplete() {
        const options = { componentRestrictions: { country: 'my' } };
        new google.maps.places.Autocomplete(originInput, options);
        new google.maps.places.Autocomplete(destinationInput, options);
    }

    function setupEventListeners() {
        calculateBtn.addEventListener('click', handleCalculation);
        // Recalculate fuel costs without fetching a new route
        fuelTypeSelect.addEventListener('change', updateCostsFromCache);
        fuelEfficiencyInput.addEventListener('input', updateCostsFromCache);
    }
    
    function displayDataTimestamp() {
        const date = new Date(tollDatabase.last_full_update);
        dataTimestampSpan.textContent = date.toLocaleDateString('ms-MY', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // --- UI HANDLING ---
    function showLoading() {
        resultsDiv.classList.remove('hidden');
        resultsContentDiv.classList.add('hidden');
        errorMessageDiv.classList.add('hidden');
        loadingDiv.classList.remove('hidden');
    }

    function showResults() {
        loadingDiv.classList.add('hidden');
        errorMessageDiv.classList.add('hidden');
        resultsContentDiv.classList.remove('hidden');
    }

    function showError(message) {
        loadingDiv.classList.add('hidden');
        resultsContentDiv.classList.add('hidden');
        errorMessageDiv.textContent = message;
        errorMessageDiv.classList.remove('hidden');
    }

    // --- CORE CALCULATION LOGIC ---
    function handleCalculation() {
        const origin = originInput.value;
        const destination = destinationInput.value;
        if (!origin ||!destination) {
            showError('Sila masukkan lokasi asal dan destinasi.');
            return;
        }

        showLoading();
        clearMap();

        const directionsService = new google.maps.DirectionsService();
        const request = {
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode.DRIVING,
        };

        directionsService.route(request, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                lastRouteResult = result; // Cache the result
                processRoute(result.routes);
            } else {
                lastRouteResult = null;
                showError('Gagal mendapatkan laluan. Sila periksa lokasi anda.');
            }
        });
    }

    function processRoute(route) {
        if (!route ||!route.legs |

| route.legs.length === 0) {
            showError('Laluan tidak sah.');
            return;
        }
        const leg = route.legs;
        const distance = leg.distance.value / 1000; // in km
        const duration = leg.duration.text;
        const vehicleClass = vehicleClassSelect.value;
        
        const plazasOnRoute = findPlazasOnRoute(route.overview_path);
        const { totalToll, breakdown } = calculateTotalToll(plazasOnRoute, vehicleClass);
        const { fuelCost, totalJourneyCost } = calculateFuelAndTotalCost(distance, totalToll);

        updateResultsUI(totalToll, distance, duration, breakdown, fuelCost, totalJourneyCost);
        
        drawRouteOnMap(route.overview_path);
        addPlazaMarkersToMap(breakdown);

        showResults();
    }

    function updateCostsFromCache() {
        if (lastRouteResult) {
            processRoute(lastRouteResult.routes);
        }
    }
    
    function updateResultsUI(toll, distance, duration, breakdown, fuelCost, totalJourneyCost) {
        totalTollSpan.textContent = `RM ${toll.toFixed(2)}`;
        totalDistanceSpan.textContent = `${distance.toFixed(1)} km`;
        totalTimeSpan.textContent = duration;
        fuelCostSpan.textContent = `RM ${fuelCost.toFixed(2)}`;
        totalJourneyCostSpan.textContent = `RM ${totalJourneyCost.toFixed(2)}`;

        tollBreakdownList.innerHTML = '';
        if (breakdown.length > 0) {
            breakdown.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<span class="plaza-name">${item.plaza.name}</span> <span class="plaza-toll">RM ${item.cost.toFixed(2)}</span>`;
                tollBreakdownList.appendChild(li);
            });
        } else {
            const li = document.createElement('li');
            li.textContent = 'Tiada tol dikesan untuk laluan ini.';
            tollBreakdownList.appendChild(li);
        }
    }

    // --- TOLL & FUEL CALCULATION HELPERS ---
    function findPlazasOnRoute(routePath) {
        const allPlazas = tollDatabase.highways.flatMap(h => h.plazas.map(p => ({...p, highway: h})));
        const plazasOnRoute =;
        const tolerance = 0.005; // Approx 500m tolerance in lat/lon

        for (const point of routePath) {
            const routeLat = point.lat();
            const routeLng = point.lng();

            for (const plaza of allPlazas) {
                if (Math.abs(routeLat - plaza.lat) < tolerance && Math.abs(routeLng - plaza.lon) < tolerance) {
                    if (!plazasOnRoute.find(p => p.id === plaza.id)) {
                        plazasOnRoute.push(plaza);
                    }
                }
            }
        }
        return plazasOnRoute;
    }
    
    function calculateTotalToll(plazasOnRoute, vehicleClass) {
        let totalToll = 0;
        const breakdown =;
        const processedHighways = new Set();

        plazasOnRoute.forEach(plaza => {
            const highway = plaza.highway;
            if (processedHighways.has(highway.id)) return;

            if (highway.system_type === 'open') {
                const cost = plaza.rates[vehicleClass] |

| 0;
                totalToll += cost;
                breakdown.push({ plaza, cost });
            } else if (highway.system_type === 'closed') {
                const plazasForThisHighway = plazasOnRoute.filter(p => p.highway.id === highway.id);
                if (plazasForThisHighway.length >= 2) {
                    const entryPlaza = plazasForThisHighway;
                    const exitPlaza = plazasForThisHighway;
                    const plazaIds = [entryPlaza.id, exitPlaza.id].sort();
                    const rateKey = plazaIds.join('-');
                    
                    const rateInfo = highway.rates[rateKey];
                    if (rateInfo) {
                        const cost = rateInfo[vehicleClass] |

| 0;
                        totalToll += cost;
                        breakdown.push({
                            plaza: { name: `Perjalanan ${highway.name} (${entryPlaza.name} ke ${exitPlaza.name})` },
                            cost: cost
                        });
                    }
                }
                processedHighways.add(highway.id);
            }
        });

        return { totalToll, breakdown };
    }

    function calculateFuelAndTotalCost(distance, totalToll) {
        const fuelType = fuelTypeSelect.value;
        const fuelPrice = tollDatabase.fuel_prices |

| 0;
        const efficiency = parseFloat(fuelEfficiencyInput.value);

        if (isNaN(efficiency) |

| efficiency <= 0) {
            return { fuelCost: 0, totalJourneyCost: totalToll };
        }

        const fuelNeeded = distance / efficiency; // in Liters
        const fuelCost = fuelNeeded * fuelPrice;
        const totalJourneyCost = totalToll + fuelCost;

        return { fuelCost, totalJourneyCost };
    }

    // --- MAP HANDLING ---
    function clearMap() {
        if (routePolyline) map.removeLayer(routePolyline);
        markers.forEach(marker => map.removeLayer(marker));
        markers =;
    }

    function drawRouteOnMap(routePath) {
        const latLngs = routePath.map(p => [p.lat(), p.lng()]);
        routePolyline = L.polyline(latLngs, { color: 'blue' }).addTo(map);
        map.fitBounds(routePolyline.getBounds());
    }

    function addPlazaMarkersToMap(breakdown) {
        breakdown.forEach(item => {
            if (item.plaza.lat && item.plaza.lon) {
                const marker = L.marker([item.plaza.lat, item.plaza.lon])
                  .addTo(map)
                  .bindPopup(`<b>${item.plaza.name}</b><br>Tol: RM ${item.cost.toFixed(2)}`);
                markers.push(marker);
            }
        });
    }

    // --- START THE APP ---
    initialize();
});
