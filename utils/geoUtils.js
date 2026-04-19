const axios = require('axios');

async function getCityFromIp(ip) {
    try{
        // Check if we are in development mode via environment variables
        const isDev = process.env.NODE_ENV === 'development';

        // If it's localhost AND we are in dev mode, return a dummy location
        if (ip === '::1' || ip === '127.0.0.1' || ip.includes('127.0.0.1')) {
            if (isDev) {
                return { city: "Localhost", lat: 18.5204, lon: 73.8567 }; // Pune coords for testing
            } else {
                console.warn("Blocked localhost access in production mode.");
                return null; 
            }
        }

        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        return{
            city : response.data.city,
            lat : response.data.latitude,
            lon : response.data.longitude
        };
    } catch(error) {
        console.error("GeoIP Lookup failed:", error);
        return null;
    }
}

function calculateRoughDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c * 1000; // Returns distance in meters
}

// Exporting multiple functions
module.exports = {
  getCityFromIp,
  calculateRoughDistance
};