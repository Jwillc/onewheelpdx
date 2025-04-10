// api/map-config.js
module.exports = (req, res) => {
    // Return both Map ID and API key
    res.json({
        mapId: process.env.GOOGLE_MAPS_MAP_ID,
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    });
};