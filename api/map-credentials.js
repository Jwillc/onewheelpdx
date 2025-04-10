// api/map-credentials.js
module.exports = (req, res) => {
    // Return only the Map ID from server environment variables
    res.json({
        mapId: process.env.GOOGLE_MAPS_MAP_ID
    });
};