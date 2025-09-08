const fs = require('fs');

// Read and extract all GPX coordinates
function extractGPXCoordinates() {
    try {
        const gpxContent = fs.readFileSync('/Users/nicorotstein/Downloads/HEL_Metroranta_50K.gpx', 'utf8');
        
        // Parse XML and extract all trkpt coordinates
        const trkptRegex = /<trkpt lat="([^"]+)" lon="([^"]+)"/g;
        const coordinates = [];
        let match;
        
        while ((match = trkptRegex.exec(gpxContent)) !== null) {
            coordinates.push([parseFloat(match[1]), parseFloat(match[2])]);
        }
        
        console.log(`Extracted ${coordinates.length} coordinates`);
        
        // Write coordinates to JSON file for the web app
        const output = {
            route: coordinates,
            bounds: {
                north: Math.max(...coordinates.map(c => c[0])),
                south: Math.min(...coordinates.map(c => c[0])),
                east: Math.max(...coordinates.map(c => c[1])),
                west: Math.min(...coordinates.map(c => c[1]))
            }
        };
        
        fs.writeFileSync('/Users/nicorotstein/Dev/metroranta/route-data.json', JSON.stringify(output, null, 2));
        console.log('Route data saved to route-data.json');
        
        return output;
        
    } catch (error) {
        console.error('Error extracting GPX:', error);
        return null;
    }
}

if (require.main === module) {
    extractGPXCoordinates();
}

module.exports = extractGPXCoordinates;