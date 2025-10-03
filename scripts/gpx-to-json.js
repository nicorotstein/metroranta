const fs = require('fs');
const path = require('path');

// Get input and output file paths from command line arguments
const inputFile = process.argv[2] || path.join(__dirname, '../public/HEL Metroranta 50K.gpx');
const outputFile = process.argv[3] || path.join(__dirname, '../public/route-data-50k.json');

// Read the GPX file
const gpxContent = fs.readFileSync(inputFile, 'utf-8');

// Extract all trkpt elements with lat/lon attributes
const trkptRegex = /<trkpt lat="([^"]+)" lon="([^"]+)">/g;
const route = [];
let match;

while ((match = trkptRegex.exec(gpxContent)) !== null) {
  const lat = parseFloat(match[1]);
  const lon = parseFloat(match[2]);
  route.push([lat, lon]);
}

// Create the JSON object
const routeData = { route };

// Write to file
fs.writeFileSync(outputFile, JSON.stringify(routeData, null, 2));

console.log(`Converted ${route.length} coordinates from GPX to JSON`);
console.log(`Output written to: ${outputFile}`);
